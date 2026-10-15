/*
 * Turns a model pose (hips, chest, four limb targets) into every joint of the
 * climber's body. Both views draw from this, so they always agree.
 */
import { ARM, HIP_HALF, LEG, SHOULDER_HALF } from "../model/route";
import { solveLimb } from "./ik";

const normalize = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

export function solveBody(pose) {
  const { hip, chest } = pose;
  const up = normalize({ x: chest.x - hip.x, y: chest.y - hip.y, z: chest.z - hip.z });
  // Right is +x, kept square to the spine.
  const right = normalize({ x: 1 - up.x * up.x, y: -up.x * up.y, z: -up.x * up.z });
  const at = (base, side, half) => ({
    x: base.x + right.x * side * half,
    y: base.y + right.y * side * half,
    z: base.z + right.z * side * half,
  });

  const limbs = {};
  [
    ["rh", 1, true],
    ["lh", -1, true],
    ["rf", 1, false],
    ["lf", -1, false],
  ].forEach(([key, side, hand]) => {
    const root = hand ? at(chest, side, SHOULDER_HALF) : at(hip, side, HIP_HALF);
    const [upper, lower] = hand ? ARM : LEG;
    // Elbows point out and down, knees out and up (frog legs on the wall).
    const pole = hand ? { x: side, y: -0.8, z: 0.6 } : { x: side, y: 0.5, z: 0.3 };
    const { joint, end } = solveLimb(root, pose.limbs[key], upper, lower, pole);
    limbs[key] = { root, joint, end, moving: pose.limbs[key].moving };
  });

  const head = { x: chest.x + up.x * 17, y: chest.y + up.y * 17, z: chest.z + up.z * 17 };
  return { hip, chest, up, right, head, limbs };
}
