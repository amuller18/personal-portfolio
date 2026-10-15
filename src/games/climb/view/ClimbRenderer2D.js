/*
 * Flat fallback view (?view=2d, or when WebGL is unavailable). Same contract
 * as the 3D renderer and the same rig, drawn face-on: the wall, the holds,
 * the rope and the climber, with the camera following the hips.
 */
import { clamp, lerp, mixColor } from "../../shared/math";
import { solveBody } from "./rig";

const PIXELS_PER_UNIT = 1.1;
const STRATA = ["#b5562f", "#c4653a", "#a94c2b", "#d07a45", "#9e4528", "#bf5d34"];

export default class ClimbRenderer2D {
  constructor(canvas, route) {
    this.canvas = canvas;
    this.route = route;
    this.ctx = canvas.getContext("2d");
    this.reducedMotion = false;
    this.cameraY = route.stances[0].hip.y + 160;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.narrow = this.width < 760;
  }

  render(frame, dt) {
    const { ctx, width, height, route } = this;
    const { pose } = frame;
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-clamp(dt, 0, 0.05) * 6);
    this.cameraY = lerp(this.cameraY, pose.hip.y + 30, k);
    const scale = PIXELS_PER_UNIT * (this.narrow ? 0.8 : 1);
    const nearStop = Math.abs(frame.progress - Math.round(frame.progress)) < 0.1;
    const shiftX = !this.narrow && nearStop ? -width * 0.17 : 0;
    const shiftY = this.narrow && nearStop ? -height * 0.2 : 0;
    const sx = (x) => width / 2 + shiftX + (x - pose.hip.x * 0.6) * scale;
    const sy = (y) => height / 2 + shiftY - (y - this.cameraY) * scale;

    // Sky, then the wall with its sandstone bands.
    const t = frame.progress / (route.stopCount - 1);
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, mixColor("#2f7fd6", "#3b2f7a", t));
    sky.addColorStop(1, mixColor("#d7ecff", "#ff9a5c", t));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const wallLeft = sx(-900);
    const wallRight = sx(900);
    const topY = sy(route.top);
    const band = 95;
    const yMin = this.cameraY - height / scale;
    const yMax = this.cameraY + height / scale;
    for (let y = Math.floor(yMin / band) * band; y < Math.min(yMax, route.top); y += band) {
      const index = ((Math.floor(y / band) % STRATA.length) + STRATA.length) % STRATA.length;
      ctx.fillStyle = STRATA[index];
      const top = sy(Math.min(y + band, route.top));
      ctx.fillRect(wallLeft, top, wallRight - wallLeft, sy(y) - top + 1);
    }
    ctx.fillStyle = "#d58a52";
    ctx.fillRect(0, sy(0), width, height);
    if (topY > -10) {
      ctx.fillStyle = "#d9925a";
      ctx.fillRect(wallLeft, topY - 6, wallRight - wallLeft, 6);
    }

    // Holds (chalked once used), bolts, anchors.
    route.holds.forEach((hold) => {
      const y = sy(hold.y);
      if (y < -20 || y > height + 20) return;
      ctx.fillStyle = hold.progress <= frame.maxProgress ? "#f6f1e8" : "#e2ab72";
      ctx.beginPath();
      ctx.ellipse(sx(hold.x), y, hold.size * scale * 1.3, hold.size * scale * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#c9ccd6";
    route.bolts.forEach((bolt) => ctx.fillRect(sx(bolt.x) - 2, sy(bolt.y) - 3, 4, 6));
    route.anchors.forEach((anchor) => {
      ctx.fillRect(sx(anchor.x) - 10, sy(anchor.y) - 3, 4, 6);
      ctx.fillRect(sx(anchor.x) + 6, sy(anchor.y) - 3, 4, 6);
    });

    // Rope.
    const rope = route.ropeAt(frame.progress, pose);
    ctx.strokeStyle = "#e8467c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    rope.points.forEach((point, i) =>
      i ? ctx.lineTo(sx(point.x), sy(point.y)) : ctx.moveTo(sx(point.x), sy(point.y)),
    );
    ctx.stroke();

    // Climber, from the shared rig.
    const body = solveBody(pose);
    const line = (a, b, color, w) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w * scale;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx(a.x), sy(a.y));
      ctx.lineTo(sx(b.x), sy(b.y));
      ctx.stroke();
    };
    ["rf", "lf", "rh", "lh"].forEach((key) => {
      const limb = body.limbs[key];
      const hand = key[1] === "h";
      line(limb.root, limb.joint, hand ? "#e2552a" : "#2b3a67", hand ? 7 : 10);
      line(limb.joint, limb.end, hand ? "#e8b48f" : "#2b3a67", hand ? 6 : 8);
    });
    line(body.hip, body.chest, "#ff6b3d", 18);
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.arc(sx(body.head.x), sy(body.head.y), 8.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  dispose() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}
