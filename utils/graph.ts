import { Edge } from '../types';

export const findPath = (startId: string, endId: string, edges: Edge[]): string[] | null => {
  if (startId === endId) return [startId];

  // Breadth-First Search (BFS) for shortest path in unweighted directed graph
  const queue: { id: string; path: string[] }[] = [{ id: startId, path: [startId] }];
  const visited = new Set<string>(); // Visited set to prevent loops (though graph is DAG-like)

  while (queue.length > 0) {
    const current = queue.shift()!;
    
    // Found destination
    if (current.id === endId) {
      return current.path;
    }

    // Find outgoing neighbors
    const neighbors = edges
      .filter(e => e.from === current.id)
      .map(e => e.to);

    for (const neighbor of neighbors) {
      // Allow visiting a node if we haven't processed it in this BFS traversal path logic 
      // (Simple visited check is sufficient for shortest path in unweighted)
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({
          id: neighbor,
          path: [...current.path, neighbor]
        });
      }
    }
  }
  
  return null;
};