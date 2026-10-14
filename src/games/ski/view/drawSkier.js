/*
 * The avatar. Drawn in local units (about 60 tall, origin where the skis meet
 * the snow, y up is negative) and posed from the trick fields in tricks.js.
 * Swap the palette here to restyle the rider.
 */
import { clamp01, lerp } from "../../shared/math";

export const SKIER_SCALE = 1.25;
const PIVOT = 26; // tricks rotate around the hips, not the boots
const THIGH = 17;
const SHIN = 17;

export const RIDER = {
  jacket: "#ff4d4d",
  jacketShade: "#c7333b",
  pants: "#23315f",
  pantsShade: "#1a2448",
  helmet: "#ffd23f",
  goggles: "#1b1b2a",
  lens: "#5ef0ff",
  skin: "#f1c27d",
  ski: "#ff8a3d",
  skiBack: "#d96a24",
  boot: "#111827",
  pole: "#d9dde6",
  scarf: "#ffd23f",
};

const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

function kneeFor(hip, ankle, forward = 1) {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const d = Math.max(0.01, Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.01));
  const off = Math.sqrt(Math.max(0, THIGH * THIGH - (d / 2) ** 2));
  let nx = -dy / d;
  let ny = dx / d;
  if (nx * forward < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: (hip.x + ankle.x) / 2 + nx * off, y: (hip.y + ankle.y) / 2 + ny * off };
}

function stroke(ctx, points, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

function drawSki(ctx, foot, angle, color) {
  ctx.save();
  ctx.translate(foot.x, foot.y);
  ctx.rotate(angle);
  stroke(
    ctx,
    [
      { x: -30, y: 1 },
      { x: 26, y: 1 },
      { x: 33, y: -4 },
    ],
    3,
    color,
  );
  ctx.fillStyle = RIDER.boot;
  ctx.fillRect(-5, -7, 11, 7);
  ctx.restore();
}

function drawLeg(ctx, hip, foot, color) {
  const ankle = { x: foot.x, y: foot.y - 6 };
  stroke(ctx, [hip, kneeFor(hip, ankle), ankle], 7, color);
}

/**
 * @param ctx      2D context
 * @param options  { x, y, angle, pose, zoom, time, speed (0..1), airborne, squash (0..1) }
 */
export default function drawSkier(ctx, { x, y, angle, pose, zoom, time, speed, airborne, squash }) {
  const scale = zoom * SKIER_SCALE;
  let facing = Math.cos(pose.spin * Math.PI * 2);
  if (Math.abs(facing) < 0.14) facing = facing < 0 ? -0.14 : 0.14;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.translate(0, -PIVOT * scale);
  ctx.rotate((pose.rotation * Math.PI) / 180);
  ctx.scale(scale * facing, scale);
  ctx.translate(0, PIVOT);

  const carve = airborne ? 0 : 0.15 + speed * 0.3;
  const bend = clamp01(Math.max(pose.tuck, carve) + squash * 0.6);
  const lift = pose.grab * 6 + pose.tuck * 3;

  const hip = { x: -3 - bend * 4, y: -(35 - bend * 13) };
  const front = { x: 4 + pose.split * 14, y: -pose.split * 4 - lift };
  const back = { x: -4 - pose.split * 14, y: -pose.split * 4 - lift };
  const frontAngle = -pose.split * 0.45 + pose.cross * 0.6;
  const backAngle = pose.split * 0.45 - pose.cross * 0.6;
  const shoulder = { x: hip.x + 7 + bend * 7, y: hip.y - 21 + bend * 5 };
  const head = { x: shoulder.x + 3, y: shoulder.y - 9 };

  // Far side first: back ski, back leg, back arm.
  drawSki(ctx, back, backAngle, RIDER.skiBack);
  drawLeg(ctx, hip, back, RIDER.pantsShade);
  const backHand = mix({ x: shoulder.x + 8, y: shoulder.y + 12 }, { x: shoulder.x - 10, y: shoulder.y - 12 }, pose.arms);
  stroke(ctx, [shoulder, backHand], 5, RIDER.jacketShade);

  // Scarf streams behind, faster with speed.
  const flutter = 1 + speed * 2.5;
  const neck = { x: shoulder.x - 2, y: shoulder.y - 2 };
  const scarf = [neck];
  for (let i = 1; i <= 3; i += 1) {
    scarf.push({
      x: neck.x - i * 6,
      y: neck.y + i * 1.5 + Math.sin(time * 14 + i * 1.3) * flutter * i * 0.6,
    });
  }
  stroke(ctx, scarf, 3, RIDER.scarf);

  // Torso and head.
  stroke(ctx, [hip, shoulder], 11, RIDER.jacket);
  stroke(ctx, [{ x: hip.x + 1, y: hip.y - 2 }, { x: shoulder.x - 2, y: shoulder.y + 3 }], 2, RIDER.jacketShade);
  ctx.fillStyle = RIDER.skin;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RIDER.helmet;
  ctx.beginPath();
  ctx.arc(head.x, head.y - 0.5, 7.2, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(head.x - 7.2, head.y - 1, 4, 3);
  ctx.fillStyle = RIDER.goggles;
  ctx.fillRect(head.x - 1, head.y - 2, 8, 4);
  ctx.fillStyle = RIDER.lens;
  ctx.fillRect(head.x + 1.5, head.y - 1.5, 5, 3);

  // Near side: front ski, front leg, front arm with pole.
  drawSki(ctx, front, frontAngle, RIDER.ski);
  drawLeg(ctx, hip, front, RIDER.pants);

  const rest = { x: shoulder.x + 12 - bend * 2, y: shoulder.y + 11 };
  const raised = { x: shoulder.x + 8, y: shoulder.y - 14 };
  const grabbed = { x: front.x + 8, y: front.y - 4 };
  const hand = mix(mix(rest, raised, pose.arms), grabbed, pose.grab);
  stroke(ctx, [shoulder, hand], 5, RIDER.jacketShade);

  const poleRest = { x: hand.x - 26, y: hand.y + 24 };
  const poleUp = { x: hand.x + 16, y: hand.y - 22 };
  const poleTucked = { x: hand.x - 30, y: hand.y - 4 };
  const tip = mix(mix(poleRest, poleUp, pose.arms), poleTucked, Math.max(pose.grab, pose.tuck * 0.6));
  stroke(ctx, [hand, tip], 1.8, RIDER.pole);
  ctx.fillStyle = RIDER.pole;
  ctx.fillRect(tip.x - 2, tip.y - 1, 4, 2);
  ctx.fillStyle = RIDER.goggles;
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
