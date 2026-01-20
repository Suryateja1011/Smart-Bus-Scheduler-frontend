import { Point } from '../types';

// Calculate a Quadratic Bezier point at t (0 to 1)
export const getQuadraticBezierPoint = (
  t: number,
  p0: Point,
  p1: Point,
  p2: Point
): Point => {
  const oneMinusT = 1 - t;
  const x =
    oneMinusT * oneMinusT * p0.x +
    2 * oneMinusT * t * p1.x +
    t * t * p2.x;
  const y =
    oneMinusT * oneMinusT * p0.y +
    2 * oneMinusT * t * p1.y +
    t * t * p2.y;
  return { x, y };
};

// Calculate rotation angle (tangent) at t
export const getQuadraticBezierAngle = (
  t: number,
  p0: Point,
  p1: Point,
  p2: Point
): number => {
  // Derivative of Quadratic Bezier: 2(1-t)(P1-P0) + 2t(P2-P1)
  const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

// Calculate the control point for a curve based on start, end, and an offset
export const calculateControlPoint = (
  start: Point,
  end: Point,
  offset: Point
): Point => {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  return { x: midX + offset.x, y: midY + offset.y };
};
