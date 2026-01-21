from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import cv2
import numpy as np
import math
import copy

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

model = YOLO("yolov8l.pt")

# -------------------------------
# ROUTES
# -------------------------------
ROUTES = [
    {"id": 1, "name": "Route 1: Northern Express", "path": ["B1", "B2", "B3", "B4", "B5"]},
    {"id": 2, "name": "Route 2: Central Link", "path": ["B1", "B2", "B3", "B6", "B7"]},
    {"id": 3, "name": "Route 3: Long Haul South", "path": ["B1", "B2", "B3", "B6", "B8", "B9"]},
    {"id": 4, "name": "Route 4: Southern Edge", "path": ["B1", "B2", "B3", "B6", "B10"]},
]

# Splitting stands
BRANCH_SPLITS = {"B3": 2, "B6": 3}

# ------------------------- TUNABLE PARAMETERS -------------------------
BUS_CAPACITY = 20              # people per bus
MIN_FREQUENCY_SEC = 10.0       # minimum allowed dispatch interval (seconds)
MAX_BUSES_PER_ROUTE = 50       # upper hard cap per route
PENALTY_PER_BUS = 8.0          # penalty per bus in objective (higher => fewer buses)
# --------------------------------------------------------------------

def count_people_from_file(file):
    """Decode image and count people with YOLO (class 0)."""
    file_bytes = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    if img is None:
        return 0
    results = model(img)
    return sum(1 for r in results for b in r.boxes if int(b.cls[0]) == 0)

def avg_wait_for_route(cycle_sec, buses_allocated):
    """Average waiting time per passenger for a route (seconds)."""
    if buses_allocated <= 0:
        return float('inf')
    raw_freq = cycle_sec / buses_allocated if cycle_sec > 0 else float('inf')
    freq = max(raw_freq, MIN_FREQUENCY_SEC)
    return freq / 2.0

def total_objective(route_infos, cycle_sec):
    """Total objective: total_weighted_wait + PENALTY_PER_BUS * total_buses_used"""
    total_wait = 0.0
    total_buses = 0
    for r in route_infos:
        ppl = r["total_people"]
        buses = r["buses_allocated"]
        if ppl <= 0:
            continue
        aw = avg_wait_for_route(cycle_sec, buses)
        total_wait += ppl * aw
        total_buses += buses
    return total_wait + PENALTY_PER_BUS * total_buses

@app.route('/count_people', methods=['POST', 'OPTIONS'])
def count_people():
    if request.method == 'OPTIONS':
        return jsonify({"message": "preflight OK"}), 200

    # Read inputs
    try:
        total_buses = int(request.form.get("total_buses", 0))   # depot fleet
    except:
        total_buses = 0
    try:
        total_cycles = int(request.form.get("total_cycles", 0)) # cycle duration in seconds
    except:
        total_cycles = 0

    print("\n===== INPUT RECEIVED =====")
    print("Total buses (fleet):", total_buses)
    print("Total cycle (sec):", total_cycles)
    print("==========================")

    if total_buses < 0:
        return jsonify({"error": "total_buses must be non-negative"}), 400

    # ---------------------------------------------------
    # PEOPLE COUNTING
    # ---------------------------------------------------
    slots = [f"B{i}" for i in range(1, 11)]
    slot_counts = {}
    for s in slots:
        if s in request.files:
            f = request.files[s]
            if f and f.filename:
                f.stream.seek(0)
                slot_counts[s] = int(count_people_from_file(f))
            else:
                slot_counts[s] = 0
        else:
            slot_counts[s] = 0

    # ---------------------------------------------------
    # ROUTE-WISE AGGREGATION (with branch splits)
    # ---------------------------------------------------
    route_data = []
    for route in ROUTES:
        total_people = 0.0
        for stop in route["path"]:
            p = slot_counts.get(stop, 0)
            if stop in BRANCH_SPLITS and BRANCH_SPLITS[stop] > 0:
                total_people += p / BRANCH_SPLITS[stop]
            else:
                total_people += p
        route_data.append({
            "route_id": route["id"],
            "route_name": route["name"],
            "total_people": float(round(total_people, 2))
        })

    # ---------------------------------------------------
    # PROBABILITIES
    # ---------------------------------------------------
    P_total = sum(r["total_people"] for r in route_data)
    for r in route_data:
        if P_total <= 0:
            r["probability"] = 0.0
        else:
            r["probability"] = round((r["total_people"] / P_total) * 100.0, 2)

    # ---------------------------------------------------
    # Validate enough fleet for minimum 1 bus per route
    # ---------------------------------------------------
    num_routes = len(route_data)
    if total_buses < num_routes:
        return jsonify({
            "error": "Not enough buses in depot to assign minimum 1 bus per route.",
            "required_minimum": num_routes,
            "provided": total_buses
        }), 400

    # ---------------------------------------------------
    # Compute min_required and max_useful per route
    # ---------------------------------------------------
    min_required = {}
    max_useful = {}
    for r in route_data:
        rid = r["route_id"]
        ppl = r["total_people"]
        # minimum required by capacity (but at least 1)
        if ppl <= 0:
            need = 1   # policy: at least 1 bus even if no current passengers
        else:
            need = math.ceil(ppl / BUS_CAPACITY)
            need = max(1, need)
        need = min(need, MAX_BUSES_PER_ROUTE)
        min_required[rid] = need

        # max useful buses given min frequency cap (beyond this, freq cannot decrease)
        if total_cycles > 0:
            useful = int(math.floor(total_cycles / MIN_FREQUENCY_SEC))
            useful = max(1, useful)
        else:
            useful = MAX_BUSES_PER_ROUTE
        useful = min(useful, MAX_BUSES_PER_ROUTE)
        max_useful[rid] = useful

    # ---------------------------------------------------
    # Initial allocation = min_required (guarantees at least 1 per route)
    # ---------------------------------------------------
    alloc = {r["route_id"]: min_required[r["route_id"]] for r in route_data}
    used = sum(alloc.values())

    # Safety: if initial used > total_buses (shouldn't happen due to earlier check), trim to match fleet
    if used > total_buses:
        # reduce from routes with least people, but keep at least 1
        sorted_by_people = sorted(route_data, key=lambda x: x["total_people"])
        idx = 0
        excess = used - total_buses
        while excess > 0 and idx < len(sorted_by_people):
            rid = sorted_by_people[idx]["route_id"]
            if alloc[rid] > 1:
                alloc[rid] -= 1
                excess -= 1
            else:
                idx += 1
        used = sum(alloc.values())

    # ---------------------------------------------------
    # Greedy AIML allocation: assign remaining useful buses based on marginal gain
    # ---------------------------------------------------
    # Precompute route infos
    route_infos = []
    for r in route_data:
        route_infos.append({
            "route_id": r["route_id"],
            "route_name": r["route_name"],
            "total_people": r["total_people"],
            "probability": r["probability"],
            "buses_allocated": alloc[r["route_id"]]
        })

    # function to compute marginal benefit of adding one bus to route idx
    def marginal_gain_add(route_infos_local, idx):
        before = total_objective(route_infos_local, total_cycles if total_cycles>0 else 1)
        cand = copy.deepcopy(route_infos_local)
        cand[idx]["buses_allocated"] += 1
        after = total_objective(cand, total_cycles if total_cycles>0 else 1)
        # gain is reduction in objective (positive better)
        return before - after

    # available extra slots across routes = sum(max_useful - alloc)
    extra_slots = sum(max(0, max_useful[rid] - alloc[rid]) for rid in alloc)
    remaining_fleet = total_buses - sum(alloc.values())

    # we only consider adding up to remaining_fleet and up to extra_slots
    additions_allowed = min(remaining_fleet, extra_slots)

    # Greedy loop: at each step, add a bus to route with max marginal gain (> 0)
    for _ in range(additions_allowed):
        best_gain = 0.0
        best_idx = None
        for idx, rinfo in enumerate(route_infos):
            rid = rinfo["route_id"]
            # cannot exceed max_useful or MAX_BUSES_PER_ROUTE
            if rinfo["buses_allocated"] >= max_useful[rid]:
                continue
            if rinfo["buses_allocated"] >= MAX_BUSES_PER_ROUTE:
                continue
            # compute gain
            g = marginal_gain_add(route_infos, idx)
            if g > best_gain:
                best_gain = g
                best_idx = idx
        if best_idx is None or best_gain <= 1e-6:
            # no positive marginal gain: stop assigning
            break
        # apply best addition
        route_infos[best_idx]["buses_allocated"] += 1

    # After greedy assignments, compute final used and saved
    final_used = sum(r["buses_allocated"] for r in route_infos)
    saved_buses = max(0, total_buses - final_used)

    # ---------------------------------------------------
    # Prepare response (same JSON shape)
    # frequency_minutes is in seconds per frontend convention
    # ---------------------------------------------------
    response_routes = []
    for r in route_infos:
        buses = int(r["buses_allocated"])
        ppl = r["total_people"]
        freq_val = None
        if buses > 0:
            raw_freq = (total_cycles / buses) if total_cycles > 0 else float('inf')
            freq_val = round(max(raw_freq, MIN_FREQUENCY_SEC), 2)
        else:
            freq_val = None
        response_routes.append({
            "route_id": r["route_id"],
            "route_name": r["route_name"],
            "total_people": int(round(ppl)),
            "probability": round(r["probability"], 2),
            "buses_allocated": buses,
            "frequency_minutes": freq_val
        })

    slot_counts_int = {k: int(v) for k, v in slot_counts.items()}

    return jsonify({
        "slot_counts": slot_counts_int,
        "routes": response_routes,
        "saved_buses": int(saved_buses)
    }), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
