/*
 * The avatar in the 2D view. Joints come from the shared rig (rig.js), so
 * tricks and the chairlift pose match the 3D model. Swap the palette here to
 * restyle the rider in both views.
 */
import { PIVOT, solveRig } from "./rig";

export const SKIER_SCALE = 1.25;

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

function stroke(ctx, points, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

function drawBoot(ctx, foot, angle) {
  ctx.save();
  ctx.translate(foot.x, foot.y);
  ctx.rotate(angle);
  ctx.fillStyle = RIDER.boot;
  ctx.fillRect(-5, -7, 11, 7);
  ctx.restore();
}

function drawSki(ctx, ski, color) {
  ctx.save();
  ctx.translate(ski.x, ski.y);
  ctx.rotate(ski.angle);
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
  ctx.restore();
}

/**
 * @param ctx      2D context
 * @param options  { x, y, angle, pose, zoom, time, speed (0..1), airborne, squash (0..1) }
 */
export default function drawSkier(ctx, { x, y, angle, pose, zoom, time, speed, airborne, squash }) {
  const scale = zoom * SKIER_SCALE;
  let facing = Math.cos(pose.spin * Math.PI * 2);
  if (Math.abs(facing) < 0.14) facing = facing < 0 ? -0.14 : 0.14;
  const rig = solveRig(pose, { time, speed, airborne, squash });

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.translate(0, -PIVOT * scale);
  ctx.rotate((pose.rotation * Math.PI) / 180);
  ctx.scale(scale * facing, scale);
  ctx.translate(0, PIVOT);

  // Far side first: back ski, back leg, back arm.
  if (rig.carry < 0.5) drawSki(ctx, rig.skiBack, RIDER.skiBack);
  drawBoot(ctx, rig.back, rig.backAngle * (1 - rig.carry));
  stroke(ctx, [rig.hip, rig.kneeBack, rig.ankleBack], 7, RIDER.pantsShade);
  stroke(ctx, [rig.shoulder, rig.backHand], 5, RIDER.jacketShade);

  stroke(ctx, [rig.neck, ...rig.scarf], 3, RIDER.scarf);

  // Torso and head.
  const { hip, shoulder, head } = rig;
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
  if (rig.carry < 0.5) drawSki(ctx, rig.skiFront, RIDER.ski);
  drawBoot(ctx, rig.front, rig.frontAngle * (1 - rig.carry));
  stroke(ctx, [hip, rig.kneeFront, rig.ankleFront], 7, RIDER.pants);
  if (rig.carry >= 0.5) {
    drawSki(ctx, rig.skiBack, RIDER.skiBack);
    drawSki(ctx, rig.skiFront, RIDER.ski);
  }
  stroke(ctx, [shoulder, rig.hand], 5, RIDER.jacketShade);
  stroke(ctx, [rig.hand, rig.tipFront], 1.8, RIDER.pole);
  ctx.fillStyle = RIDER.pole;
  ctx.fillRect(rig.tipFront.x - 2, rig.tipFront.y - 1, 4, 2);
  ctx.fillStyle = RIDER.goggles;
  ctx.beginPath();
  ctx.arc(rig.hand.x, rig.hand.y, 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
