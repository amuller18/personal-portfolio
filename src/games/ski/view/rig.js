/*
 * Rider skeleton, shared by the 2D sprite and the 3D model so every pose
 * (tricks, carving, sitting on the chairlift) looks the same in both views.
 *
 * Joints are in the side plane, in rider units (about 60 tall): origin where
 * the skis meet the snow, x forward, y DOWN (negative is up).
 */
import { clamp01, lerp } from "../../shared/math";

export const PIVOT = 26; // tricks rotate around the hips, not the boots
export const THIGH = 17;

const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/* Knee for a two-bone leg, bending toward the ski tips. */
export function kneeFor(hip, ankle) {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const d = Math.max(0.01, Math.min(Math.hypot(dx, dy), THIGH * 2 - 0.01));
  const off = Math.sqrt(Math.max(0, THIGH * THIGH - (d / 2) ** 2));
  let nx = dy / d;
  let ny = -dx / d;
  if (nx < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: (hip.x + ankle.x) / 2 + nx * off, y: (hip.y + ankle.y) / 2 + ny * off };
}

export function solveRig(pose, { time = 0, speed = 0, airborne = false, squash = 0 } = {}) {
  const sit = clamp01(pose.sit || 0);
  const carry = clamp01(pose.carry || 0);
  const walk = clamp01(pose.walk || 0);
  const stride = pose.stride || 0;
  const carve = airborne ? 0 : (0.15 + speed * 0.3) * (1 - sit) * (1 - carry);
  const bend = clamp01(Math.max(pose.tuck, carve) + squash * 0.6);
  const lift = pose.grab * 6 + pose.tuck * 3;
  const swing = Math.sin(time * 2.4) * 3 * sit;

  // Walking: feet trade places, lifting on the forward swing; hips bob.
  const step = Math.sin(stride) * 7 * walk;
  const liftFront = Math.max(0, Math.cos(stride)) * 3 * walk;
  const liftBack = Math.max(0, -Math.cos(stride)) * 3 * walk;
  const standHip = { x: -3 - bend * 4, y: -(35 - bend * 13) - Math.abs(Math.cos(stride)) * 1.2 * walk };
  const hip = mix(standHip, { x: -8, y: -30 }, sit);
  const front = mix({ x: 4 + pose.split * 14 + step, y: -pose.split * 4 - lift - liftFront }, { x: 13, y: -4 + swing }, sit);
  const back = mix({ x: -4 - pose.split * 14 - step, y: -pose.split * 4 - lift - liftBack }, { x: 11, y: -2 - swing }, sit);
  const frontAngle = -pose.split * 0.45 + pose.cross * 0.6 + sit * 0.35;
  const backAngle = pose.split * 0.45 - pose.cross * 0.6 + sit * 0.3;

  const standShoulder = { x: hip.x + 7 + bend * 7, y: hip.y - 21 + bend * 5 };
  const shoulder = mix(standShoulder, { x: hip.x + 1, y: hip.y - 22 }, sit);
  const head = { x: shoulder.x + 3, y: shoulder.y - 9 };

  const ankleFront = { x: front.x, y: front.y - 7 };
  const ankleBack = { x: back.x, y: back.y - 7 };

  const rest = { x: shoulder.x + 12 - bend * 2, y: shoulder.y + 11 };
  const raised = { x: shoulder.x + 8, y: shoulder.y - 14 };
  const grabbed = { x: front.x + 8, y: front.y - 4 };
  const onBar = { x: shoulder.x + 11, y: shoulder.y + 6 };
  const onShoulder = { x: shoulder.x + 9, y: shoulder.y + 1 };
  const armSwing = { x: rest.x - 6 - Math.sin(stride) * 6 * walk, y: rest.y + 4 };
  const hand = mix(mix(mix(mix(rest, raised, pose.arms), grabbed, pose.grab), onBar, sit), onShoulder, carry);
  const backHand = mix(mix(mix(rest, raised, pose.arms), onBar, sit), armSwing, carry);

  const tipFor = (h) =>
    mix(
      mix(
        mix(mix({ x: h.x - 26, y: h.y + 24 }, { x: h.x + 16, y: h.y - 22 }, pose.arms), { x: h.x - 30, y: h.y - 4 }, Math.max(pose.grab, pose.tuck * 0.6)),
        { x: h.x + 3, y: h.y + 34 },
        sit,
      ),
      { x: h.x + 2, y: h.y + 36 },
      carry,
    );

  // Skis: on the boots, or both together over the shoulder (tips up front).
  const carried = { x: shoulder.x + 6, y: shoulder.y - 1, angle: -1.15 };
  const skiFront = {
    x: lerp(front.x, carried.x, carry),
    y: lerp(front.y, carried.y, carry),
    angle: lerp(frontAngle, carried.angle, carry),
  };
  const skiBack = {
    x: lerp(back.x, carried.x - 1.5, carry),
    y: lerp(back.y, carried.y + 2, carry),
    angle: lerp(backAngle, carried.angle + 0.04, carry),
  };

  const flutter = 1 + speed * 2.5;
  const neck = { x: shoulder.x - 2, y: shoulder.y - 2 };
  const scarf = [1, 2, 3].map((k) => ({
    x: neck.x - k * 6,
    y: neck.y + k * 1.5 + Math.sin(time * 14 + k * 1.3) * flutter * k * 0.6,
    z: Math.cos(time * 11 + k) * flutter * k * 0.4,
  }));

  return {
    sit,
    carry,
    bend,
    skiFront,
    skiBack,
    hip,
    shoulder,
    head,
    neck,
    front,
    back,
    frontAngle,
    backAngle,
    ankleFront,
    ankleBack,
    kneeFront: kneeFor(hip, ankleFront),
    kneeBack: kneeFor(hip, ankleBack),
    hand,
    backHand,
    tipFront: tipFor(hand),
    tipBack: tipFor(backHand),
    scarf,
  };
}
