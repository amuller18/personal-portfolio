/*
 * Two-bone inverse kinematics on plain {x, y, z} points, shared by the 3D
 * and 2D views. Given a shoulder (or hip), a hand (or foot) target, the two
 * bone lengths and a pole direction (which way the elbow or knee points),
 * returns the joint and the reachable end point.
 */
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const addTo = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a) => Math.sqrt(dot(a, a));

export function solveLimb(root, target, upper, lower, pole) {
  const toTarget = sub(target, root);
  const raw = length(toTarget);
  const dir = raw > 1e-6 ? scale(toTarget, 1 / raw) : { x: 0, y: -1, z: 0 };
  const reach = Math.min(Math.max(raw, Math.abs(upper - lower) + 0.01), upper + lower - 0.01);

  // The bend direction: the pole with its component along the limb removed.
  let bend = sub(pole, scale(dir, dot(pole, dir)));
  const bendLength = length(bend);
  bend = bendLength > 1e-6 ? scale(bend, 1 / bendLength) : { x: 0, y: 0, z: 1 };

  const cos = (upper * upper + reach * reach - lower * lower) / (2 * upper * reach);
  const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
  const joint = addTo(root, addTo(scale(dir, upper * Math.cos(angle)), scale(bend, upper * Math.sin(angle))));
  const end = addTo(root, scale(dir, reach));
  return { joint, end };
}
