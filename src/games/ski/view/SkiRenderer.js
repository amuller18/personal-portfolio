/*
 * Canvas view of the run. Reads model frames, never writes to the model.
 *
 * The canvas is rendered at a fraction of the CSS size and scaled up with
 * `image-rendering: pixelated`, which gives the chunky pixel-art look and keeps
 * the per-frame cost low. Visual-only effects (snow spray, confetti, shake,
 * snowfall) live here because they have no bearing on game state.
 */
import { KICKER, LIFT } from "../model/course";
import { clamp, clamp01, lerp, mixColor, seededRandom, smoothRange } from "../../shared/math";
import drawSkier from "./drawSkier";
import { GATE_COLORS } from "./palette";

const FONT = '"Press Start 2P", ui-monospace, monospace';
const FONT_SIZE = 8; // Press Start 2P is drawn on an 8px grid

const SKY = [
  { at: 0, top: "#232a6b", bottom: "#ffb38a" },
  { at: 0.45, top: "#2f7fd6", bottom: "#cdeaff" },
  { at: 1, top: "#3b4f9e", bottom: "#ffcf8f" },
];

const RANGES = [
  { seed: 7, parallax: 0.06, base: 0.6, height: 0.34, color: "#8a9ed6", haze: 0.45 },
  { seed: 11, parallax: 0.14, base: 0.7, height: 0.32, color: "#5d74b8", haze: 0.25 },
  { seed: 23, parallax: 0.26, base: 0.82, height: 0.3, color: "#3b4f8c", haze: 0.1 },
];

const CONFETTI = ["#ff4d4d", "#ffd23f", "#2bd9a0", "#5ef0ff", "#c77dff", "#ffffff"];
const MAX_PARTICLES = 420;
const GRAVITY = 900;

function skyAt(t) {
  for (let i = 1; i < SKY.length; i += 1) {
    if (t <= SKY[i].at) {
      const a = SKY[i - 1];
      const b = SKY[i];
      const k = (t - a.at) / (b.at - a.at);
      return { top: mixColor(a.top, b.top, k), bottom: mixColor(a.bottom, b.bottom, k), raw: [a, b, k] };
    }
  }
  const last = SKY[SKY.length - 1];
  return { top: last.top, bottom: last.bottom, raw: [last, last, 0] };
}

function buildRange(seed, knots = 24) {
  const rand = seededRandom(seed);
  return Array.from({ length: knots }, (_, i) => (i % 2 === 0 ? 0.55 + rand() * 0.45 : rand() * 0.35));
}

export default class SkiRenderer {
  constructor(canvas, course) {
    this.canvas = canvas;
    this.canvas.classList.add("is-pixel");
    this.ctx = canvas.getContext("2d");
    this.course = course;
    this.reducedMotion = false;
    this.camera = { x: 0, y: course.groundY(0), zoom: 1, ready: false, dx: 0, dy: 0 };
    this.particles = [];
    this.sprayCarry = 0;
    this.shake = 0;
    this.squash = 0;
    this.prev = { airborne: false, velocity: 0, finished: false };
    this.ranges = RANGES.map((range) => ({ ...range, profile: buildRange(range.seed) }));
    const rand = seededRandom(42);
    this.clouds = Array.from({ length: 6 }, () => ({
      x: rand(),
      y: 0.06 + rand() * 0.26,
      w: 0.08 + rand() * 0.1,
      speed: 2 + rand() * 5,
    }));
    this.streaks = Array.from({ length: 16 }, () => ({ y: rand(), phase: rand(), len: 0.5 + rand() }));
    this.flakes = [];
    this.flakeRand = seededRandom(99);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.cssWidth = Math.max(1, rect.width);
    this.cssHeight = Math.max(1, rect.height);
    this.pixel = clamp(Math.round(this.cssWidth / 480), 2, 4);
    this.W = Math.max(1, Math.ceil(this.cssWidth / this.pixel));
    this.H = Math.max(1, Math.ceil(this.cssHeight / this.pixel));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.narrow = this.cssWidth < 760;
    this.baseZoom = this.H / (this.narrow ? 760 : 640);
    this.anchorX = this.W * (this.narrow ? 0.5 : 0.62);
    this.anchorY = this.H * (this.narrow ? 0.34 : 0.5);

    const count = Math.round((this.W * this.H) / 1400);
    this.flakes = Array.from({ length: count }, () => ({
      x: this.flakeRand() * this.W,
      y: this.flakeRand() * this.H,
      size: this.flakeRand() < 0.25 ? 2 : 1,
      fall: 8 + this.flakeRand() * 22,
      phase: this.flakeRand() * Math.PI * 2,
    }));
  }

  dispose() {
    this.canvas.classList.remove("is-pixel");
    this.particles = [];
  }

  /* ---------- Coordinates ---------- */

  sx(wx) {
    return (wx - this.camera.x) * this.camera.zoom + this.anchorX;
  }

  sy(wy) {
    return (wy - this.camera.y) * this.camera.zoom + this.anchorY;
  }

  worldLeft(margin = 0) {
    return this.camera.x - (this.anchorX + margin) / this.camera.zoom;
  }

  worldRight(margin = 0) {
    return this.camera.x + (this.W - this.anchorX + margin) / this.camera.zoom;
  }

  /* ---------- Frame ---------- */

  render(frame, rawDt) {
    const dt = clamp(rawDt, 0, 0.05);
    const { ctx, W, H } = this;
    const { skier } = frame;
    const lastStop = this.course.stopCount - 1;
    const progressFrac = frame.progress / lastStop;
    const speedNorm = clamp01(frame.speed / 1400);
    const airEnv = skier.airborne ? Math.sin(Math.PI * skier.air) : 0;

    this.updateCamera(frame, dt, speedNorm, airEnv);
    this.updateEvents(frame, dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = skyAt(progressFrac);
    this.drawSky(sky, progressFrac, frame.time);

    ctx.save();
    if (this.shake > 0 && !this.reducedMotion) {
      const amount = this.shake * 10;
      ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
    }
    this.drawRanges(sky);
    this.drawTrees(false);
    this.drawTerrain();
    this.drawJumps(frame);
    this.drawTracks(skier);
    this.drawLifts(frame);
    this.drawLandmarks(frame);
    this.drawShadow(skier);
    this.updateParticles(dt);
    this.drawParticles(true);
    drawSkier(ctx, {
      x: this.sx(skier.x),
      y: this.sy(skier.y),
      angle: skier.angle,
      pose: skier.pose,
      zoom: this.camera.zoom,
      time: frame.time,
      speed: speedNorm,
      airborne: skier.airborne,
      squash: this.squash,
    });
    this.drawParticles(false);
    this.drawTrees(true);
    ctx.restore();

    this.drawSnowfall(frame.time, dt);
    this.drawSpeedLines(frame.time, speedNorm, skier.angle);
    this.drawLetterbox(airEnv);
  }

  updateCamera(frame, dt, speedNorm, airEnv) {
    const { camera } = this;
    const lead = clamp(frame.velocity * 160, -120, 220);
    const targetX = frame.skier.x + lead;
    const targetY = frame.skier.focusY;
    const targetZoom = this.baseZoom * (1 - 0.14 * airEnv - 0.06 * speedNorm);
    const far = Math.abs(targetX - camera.x) > 2500;
    const prevX = camera.x;
    const prevY = camera.y;

    if (!camera.ready || far || this.reducedMotion) {
      camera.x = targetX;
      camera.y = targetY;
      camera.zoom = targetZoom;
      camera.ready = true;
    } else {
      const k = 1 - Math.exp(-dt * 7);
      camera.x += (targetX - camera.x) * k;
      camera.y += (targetY - camera.y) * k;
      camera.zoom += (targetZoom - camera.zoom) * (1 - Math.exp(-dt * 3));
    }
    camera.dx = far ? 0 : camera.x - prevX;
    camera.dy = far ? 0 : camera.y - prevY;
  }

  /* Landing bursts, takeoff puffs, hockey stops and finish confetti. */
  updateEvents(frame, dt) {
    const { skier } = frame;
    const prev = this.prev;
    const lastStop = this.course.stopCount - 1;
    this.shake = Math.max(0, this.shake - dt);
    this.squash = Math.max(0, this.squash - dt * 2.8);

    if (prev.airborne && !skier.airborne && frame.velocity > 0) {
      this.burst(skier.x, skier.y, 40, { spread: 260, lift: 340, size: 3 });
      this.shake = 0.28;
      this.squash = 1;
    }
    if (!prev.airborne && skier.airborne && frame.velocity > 0) {
      this.burst(skier.x, skier.y, 14, { spread: 120, lift: 200, size: 2, push: 200 });
    }

    const nearStop = Math.abs(frame.progress - Math.round(frame.progress)) < 0.12;
    if (
      !skier.airborne &&
      nearStop &&
      Math.abs(prev.velocity) >= 0.12 &&
      Math.abs(frame.velocity) < 0.12
    ) {
      const dir = Math.sign(prev.velocity) || 1;
      this.burst(skier.x + dir * 10, skier.y, 34, { spread: 160, lift: 260, size: 2, push: dir * 380 });
      const gateY = this.course.groundY(this.course.stopX(Math.round(frame.progress))) - 100;
      this.burst(this.course.stopX(Math.round(frame.progress)), gateY, 26, {
        spread: 220,
        lift: 260,
        size: 2,
        colors: CONFETTI,
        gravity: 260,
      });
    }

    if (!skier.airborne && frame.speed > 200 && !this.reducedMotion) {
      this.sprayCarry += dt * clamp(frame.speed / 40, 0, 50);
      const dir = Math.sign(frame.velocity) || 1;
      while (this.sprayCarry >= 1) {
        this.sprayCarry -= 1;
        this.spawn({
          x: skier.x - dir * Math.cos(skier.angle) * 26,
          y: skier.y - 2,
          vx: -dir * (80 + Math.random() * 160),
          vy: -(60 + Math.random() * 160),
          life: 0.35 + Math.random() * 0.35,
          size: Math.random() < 0.3 ? 3 : 2,
          color: "#ffffff",
          gravity: GRAVITY,
        });
      }
    }

    const finished = frame.progress > lastStop - 0.01;
    if (finished && !this.reducedMotion && Math.random() < 0.7) {
      const fx = this.course.stopX(lastStop);
      this.spawn({
        x: fx + (Math.random() - 0.5) * 260,
        y: this.course.groundY(fx) - 220 - Math.random() * 80,
        vx: (Math.random() - 0.5) * 60,
        vy: 20 + Math.random() * 40,
        life: 2.4,
        size: 2,
        color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
        gravity: 40,
        flutter: true,
      });
    }

    prev.airborne = skier.airborne;
    prev.velocity = frame.velocity;
  }

  /* ---------- Particles ---------- */

  spawn(particle) {
    if (this.reducedMotion) return;
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ ...particle, age: 0, front: Math.random() < 0.5 });
  }

  burst(x, y, count, { spread, lift, size, push = 0, colors = null, gravity = GRAVITY }) {
    for (let i = 0; i < count; i += 1) {
      this.spawn({
        x,
        y: y - 2,
        vx: push + (Math.random() - 0.5) * spread * 2,
        vy: -(lift * (0.4 + Math.random() * 0.6)),
        life: 0.5 + Math.random() * 0.6,
        size: Math.random() < 0.3 ? size + 1 : size,
        color: colors ? colors[Math.floor(Math.random() * colors.length)] : "#ffffff",
        gravity,
      });
    }
  }

  updateParticles(dt) {
    this.particles = this.particles.filter((p) => {
      p.age += dt;
      p.vy += p.gravity * dt;
      p.x += (p.vx + (p.flutter ? Math.sin(p.age * 9) * 40 : 0)) * dt;
      p.y += p.vy * dt;
      return p.age < p.life;
    });
  }

  drawParticles(behind) {
    const { ctx } = this;
    this.particles.forEach((p) => {
      if (p.front === behind) return;
      ctx.globalAlpha = clamp01(1 - p.age / p.life) * 0.95;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(this.sx(p.x)), Math.round(this.sy(p.y)), p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }

  /* ---------- Background ---------- */

  drawSky(sky, progressFrac, time) {
    const { ctx, W, H } = this;
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, sky.top);
    gradient.addColorStop(1, sky.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    const sunX = W * (0.8 - progressFrac * 0.12);
    const sunY = H * (lerp(0.42, 0.14, smoothRange(progressFrac, 0, 0.5)) + 0.14 * smoothRange(progressFrac, 0.6, 1));
    const r = Math.max(6, H * 0.05);
    [3.2, 2.2, 1.5].forEach((m, i) => {
      ctx.fillStyle = `rgba(255, 240, 190, ${0.08 + i * 0.06})`;
      ctx.beginPath();
      ctx.arc(sunX, sunY, r * m, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#fff6d0";
    ctx.beginPath();
    ctx.arc(sunX, sunY, r, 0, Math.PI * 2);
    ctx.fill();

    const span = W * 1.5;
    this.clouds.forEach((cloud) => {
      const drift = this.reducedMotion ? 0 : time * cloud.speed;
      const raw = cloud.x * span - this.camera.x * this.camera.zoom * 0.03 - drift;
      const x = (((raw % span) + span) % span) - W * 0.25;
      const y = cloud.y * H;
      const w = cloud.w * W;
      const h = Math.max(3, w * 0.22);
      ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      ctx.fillRect(Math.round(x + w * 0.2), Math.round(y - h * 0.6), Math.round(w * 0.45), Math.round(h));
      ctx.fillRect(Math.round(x + w * 0.5), Math.round(y - h * 0.35), Math.round(w * 0.35), Math.round(h));
    });
  }

  drawRanges(sky) {
    const { ctx, W, H, camera } = this;
    const descent = camera.y - this.course.groundY(0);
    this.ranges.forEach((range) => {
      const knots = range.profile.length;
      const period = Math.max(W, H) * 1.5;
      const step = period / knots;
      const offset = (((camera.x * camera.zoom * range.parallax) % period) + period) % period;
      const base = H * range.base - clamp(descent * camera.zoom * range.parallax * 0.6, 0, H * 0.3);
      const height = H * range.height;
      const first = Math.floor(offset / step);

      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0; ; i += 1) {
        const index = first + i;
        const x = index * step - offset;
        ctx.lineTo(x, base - range.profile[index % knots] * height);
        if (x > W) break;
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = mixColor(range.color, sky.raw[0].bottom, range.haze * 0.8);
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = "rgba(240, 246, 255, 0.92)";
      ctx.fillRect(0, 0, W, base - height * 0.62);
      ctx.restore();
    });
  }

  drawTree(x, y, scale, tint, front) {
    const { ctx } = this;
    const h = 110 * scale * this.camera.zoom;
    const w = h * 0.55;
    const green = front ? "#133d34" : mixColor("#1f5f4a", "#2d7a5a", tint);
    ctx.fillStyle = "#5a3b28";
    ctx.fillRect(Math.round(x - w * 0.06), Math.round(y - h * 0.16), Math.max(1, Math.round(w * 0.12)), Math.round(h * 0.18));
    for (let tier = 0; tier < 3; tier += 1) {
      const top = y - h * (0.42 + tier * 0.27);
      const bottom = y - h * (0.12 + tier * 0.25);
      const half = w * (0.5 - tier * 0.12);
      ctx.fillStyle = green;
      ctx.beginPath();
      ctx.moveTo(x, top - h * 0.14);
      ctx.lineTo(x + half, bottom);
      ctx.lineTo(x - half, bottom);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f2f7ff";
      ctx.beginPath();
      ctx.moveTo(x, top - h * 0.14);
      ctx.lineTo(x + half * 0.45, top + h * 0.02);
      ctx.lineTo(x - half * 0.45, top + h * 0.02);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawTrees(front) {
    const left = this.worldLeft(80);
    const right = this.worldRight(80);
    this.course.trees.forEach((tree) => {
      if (tree.front !== front || tree.x < left || tree.x > right) return;
      const y = this.sy(this.course.groundY(tree.x) + tree.depth);
      this.drawTree(this.sx(tree.x), y, tree.size, tree.tint, front);
    });
  }

  /* ---------- Terrain ---------- */

  traceGround(ctx, offset = 0) {
    const { W } = this;
    for (let x = -2; x <= W + 2; x += 2) {
      const wx = this.camera.x + (x - this.anchorX) / this.camera.zoom;
      const y = this.sy(this.course.groundY(wx) + offset);
      if (x === -2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  drawTerrain() {
    const { ctx, W, H } = this;
    ctx.beginPath();
    this.traceGround(ctx);
    ctx.lineTo(W + 2, H + 2);
    ctx.lineTo(-2, H + 2);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, H * 0.3, 0, H);
    gradient.addColorStop(0, "#f7fbff");
    gradient.addColorStop(1, "#bccdea");
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    this.traceGround(ctx, 7);
    ctx.strokeStyle = "rgba(160, 184, 222, 0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    this.traceGround(ctx);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawJumps(frame) {
    const { ctx, course } = this;
    const left = this.worldLeft(60);
    const right = this.worldRight(60);
    course.jumps.forEach((jump) => {
      if (jump.landX < left || jump.startX > right) return;
      const endX = jump.lipX + (KICKER.end - KICKER.lip) * course.runLength;

      ctx.beginPath();
      for (let x = jump.startX; x <= endX; x += 3) ctx.lineTo(this.sx(x), this.sy(course.groundY(x)));
      for (let x = endX; x >= jump.startX; x -= 3) ctx.lineTo(this.sx(x), this.sy(course.baseY(x)));
      ctx.closePath();
      ctx.fillStyle = "#dbe6f7";
      ctx.fill();
      ctx.strokeStyle = "#8eaad6";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Orange lip stripe, then a takeoff flag and a landing flag.
      ctx.beginPath();
      for (let x = jump.lipX - 26; x <= jump.lipX; x += 2) ctx.lineTo(this.sx(x), this.sy(course.groundY(x)));
      ctx.strokeStyle = "#ff8a3d";
      ctx.lineWidth = 2;
      ctx.stroke();

      const wave = Math.sin(frame.time * 6 + jump.index) * 3;
      this.drawFlag(jump.lipX + 8, course.baseY(jump.lipX + 8), "#ff8a3d", wave);
      this.drawFlag(jump.landX + 30, course.groundY(jump.landX + 30), "#5ef0ff", wave);
    });
  }

  drawFlag(wx, wy, color, wave) {
    const { ctx } = this;
    const z = this.camera.zoom;
    const x = this.sx(wx);
    const y = this.sy(wy);
    ctx.fillStyle = "#333a4d";
    ctx.fillRect(Math.round(x), Math.round(y - 34 * z), Math.max(1, Math.round(1.6 * z)), Math.round(34 * z));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 1, y - 34 * z);
    ctx.lineTo(x + (16 + wave) * z, y - 29 * z);
    ctx.lineTo(x + 1, y - 24 * z);
    ctx.closePath();
    ctx.fill();
  }

  drawTracks(skier) {
    const { ctx, course } = this;
    const left = Math.max(this.worldLeft(), 0);
    const right = Math.min(this.worldRight(), skier.x - 20);
    if (right <= left) return;
    ctx.beginPath();
    let drawing = false;
    for (let x = left; x <= right; x += 3) {
      if (!course.isSkied(x)) {
        drawing = false;
      } else {
        const y = this.sy(course.groundY(x) + 2.5);
        if (drawing) ctx.lineTo(this.sx(x), y);
        else ctx.moveTo(this.sx(x), y);
        drawing = true;
      }
    }
    ctx.strokeStyle = "rgba(150, 175, 215, 0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* Chairlifts: cable, towers, a few looping chairs and the rider's chair. */
  drawLifts(frame) {
    const { ctx, course } = this;
    const z = this.camera.zoom;
    const left = this.worldLeft(80);
    const right = this.worldRight(80);
    const drawChair = (x, y) => {
      const sx = this.sx(x);
      const sy = this.sy(y);
      ctx.fillStyle = "#2b3550";
      ctx.fillRect(Math.round(sx), Math.round(sy - (LIFT.hanger + 7) * z), Math.max(1, Math.round(z)), Math.round((LIFT.hanger + 7) * z));
      ctx.fillStyle = "#3a63d8";
      ctx.fillRect(Math.round(sx - 9 * z), Math.round(sy - 7 * z), Math.round(20 * z), Math.max(1, Math.round(3 * z)));
      ctx.fillRect(Math.round(sx - 10 * z), Math.round(sy - 28 * z), Math.max(1, Math.round(3 * z)), Math.round(22 * z));
    };
    course.lifts.forEach((lift) => {
      if (lift.unloadX < left || lift.loadX > right) return;
      ctx.beginPath();
      for (let i = 0; i <= 40; i += 1) {
        const seat = lift.seatAt(i / 40);
        const y = this.sy(seat.y - LIFT.hanger - 7);
        if (i === 0) ctx.moveTo(this.sx(seat.x), y);
        else ctx.lineTo(this.sx(seat.x), y);
      }
      ctx.strokeStyle = "#1b2236";
      ctx.lineWidth = 1;
      ctx.stroke();
      [0.2, 0.4, 0.6, 0.8].forEach((t) => {
        const seat = lift.seatAt(t);
        const top = seat.y - LIFT.hanger - 12;
        ctx.fillStyle = "#2b3550";
        ctx.fillRect(Math.round(this.sx(seat.x) - 2 * z), Math.round(this.sy(top)), Math.max(2, Math.round(4 * z)), Math.round((course.groundY(seat.x) - top) * z));
      });
      for (let i = 0; i < 6; i += 1) {
        const s = (((frame.time * 0.07 + i / 6) % 1) + 1) % 1;
        const seat = lift.seatAt(s);
        drawChair(seat.x, seat.y);
      }
    });
    if (frame.skier.lift) drawChair(frame.skier.lift.chairX, frame.skier.lift.chairY);
  }

  drawShadow(skier) {
    if (!skier.airborne) return;
    const { ctx } = this;
    const ground = this.course.groundY(skier.x);
    const height = ground - skier.y;
    const scale = clamp01(1 - height / 420);
    ctx.fillStyle = `rgba(40, 60, 110, ${0.12 + 0.18 * scale})`;
    ctx.beginPath();
    ctx.ellipse(this.sx(skier.x), this.sy(ground), 30 * scale * this.camera.zoom + 1, 4 * this.camera.zoom + 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- Gates, summit, lodge ---------- */

  drawLandmarks(frame) {
    const { course } = this;
    const left = this.worldLeft(300);
    const right = this.worldRight(300);
    course.stops.forEach((stop, index) => {
      const x = course.stopX(index);
      if (x < left || x > right) return;
      const reached = frame.maxProgress >= index - 0.02;
      if (stop.kind === "start") this.drawSummit(frame.time);
      if (stop.kind === "finish") this.drawLodge(x + 560);
      this.drawGate(x, stop, index, reached, frame.time);
    });
  }

  drawGate(wx, stop, index, reached, time) {
    const { ctx, course } = this;
    const z = this.camera.zoom;
    const finish = stop.kind === "finish";
    const halfWidth = finish ? 70 : 46;
    const height = finish ? 130 : 104;
    const leftX = wx - halfWidth;
    const rightX = wx + halfWidth;
    const leftY = course.groundY(leftX);
    const rightY = course.groundY(rightX);
    const topY = Math.min(leftY, rightY) - height;
    const pole = Math.max(1, Math.round(4 * z));

    ctx.fillStyle = "#2b3550";
    ctx.fillRect(Math.round(this.sx(leftX)), Math.round(this.sy(topY)), pole, Math.round((leftY - topY) * z));
    ctx.fillRect(Math.round(this.sx(rightX) - pole), Math.round(this.sy(topY)), pole, Math.round((rightY - topY) * z));

    const bx = this.sx(leftX);
    const by = this.sy(topY);
    const bw = halfWidth * 2 * z;
    const bh = (finish ? 30 : 24) * z;
    const color = finish ? "#ffffff" : stop.kind === "start" ? "#ff4d4d" : GATE_COLORS[index % GATE_COLORS.length];
    ctx.fillStyle = "#0b1030";
    ctx.fillRect(Math.round(bx - 1), Math.round(by - 1), Math.round(bw + 2), Math.round(bh + 2));
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(bx), Math.round(by), Math.round(bw), Math.round(bh));

    if (finish) {
      const cell = Math.max(2, Math.round(6 * z));
      for (let cx = 0; cx < bw; cx += cell) {
        for (let cy = 0; cy < bh; cy += cell) {
          if ((cx / cell + cy / cell) % 2 === 0) {
            ctx.fillStyle = "#0b1030";
            ctx.fillRect(Math.round(bx + cx), Math.round(by + cy), Math.min(cell, Math.round(bw - cx)), Math.min(cell, Math.round(bh - cy)));
          }
        }
      }
    }

    const label = finish ? "FINISH" : stop.kind === "start" ? "START" : stop.number;
    const size = FONT_SIZE;
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tx = Math.round(bx + bw / 2);
    const ty = Math.round(by + bh / 2 + 1);
    if (finish) {
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(Math.round(tx - size * 3.6), Math.round(ty - size * 0.8), Math.round(size * 7.2), Math.round(size * 1.6));
    }
    ctx.fillStyle = "#0b1030";
    ctx.fillText(label, tx, ty);

    // Status lamps: red until you've reached this checkpoint, then green.
    const lamp = Math.max(2, Math.round(5 * z));
    const blink = reached || Math.sin(time * 5) > 0;
    ctx.fillStyle = reached ? "#2bd9a0" : blink ? "#ff4d4d" : "#6b2430";
    ctx.fillRect(Math.round(bx - lamp / 2), Math.round(by - lamp - 1), lamp, lamp);
    ctx.fillRect(Math.round(bx + bw - lamp / 2), Math.round(by - lamp - 1), lamp, lamp);

    const wave = Math.sin(time * 6 + index) * 3;
    this.drawFlag(leftX, topY - 2, color === "#ffffff" ? "#ff4d4d" : color, wave);
  }

  drawSummit(time) {
    const { ctx, course } = this;
    const z = this.camera.zoom;
    const peakX = -330;
    const peakY = course.groundY(peakX);
    const x = this.sx(peakX);
    const y = this.sy(peakY);
    ctx.fillStyle = "#333a4d";
    ctx.fillRect(Math.round(x), Math.round(y - 80 * z), Math.max(1, Math.round(2 * z)), Math.round(80 * z));
    const wave = Math.sin(time * 5) * 4 * z;
    ctx.fillStyle = "#ff4d4d";
    ctx.fillRect(Math.round(x + 2 * z), Math.round(y - 80 * z), Math.round(28 * z + wave), Math.round(16 * z));

    // Sign board is sized in screen pixels so the 8px pixel font stays crisp.
    const signX = Math.round(this.sx(-190));
    const signY = Math.round(this.sy(course.groundY(-190)));
    const post = Math.round(30 * z);
    const boardW = FONT_SIZE * 7 + 8;
    const boardH = FONT_SIZE * 2 + 10;
    const boardTop = signY - post - boardH;
    ctx.fillStyle = "#6b4a2f";
    ctx.fillRect(signX - 1, signY - post, 2, post);
    ctx.fillStyle = "#8b6340";
    ctx.fillRect(signX - boardW / 2, boardTop, boardW, boardH);
    ctx.font = `${FONT_SIZE}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff6d0";
    ctx.fillText("SUMMIT", signX, boardTop + 4);
    ctx.fillText("11,000'", signX, boardTop + 6 + FONT_SIZE);
  }

  drawLodge(wx) {
    const { ctx, course } = this;
    const z = this.camera.zoom;
    const x = this.sx(wx);
    const y = this.sy(course.groundY(wx));
    const w = 220 * z;
    const h = 90 * z;
    ctx.fillStyle = "#7a4b2a";
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
    ctx.fillStyle = "#5a3520";
    for (let row = 1; row < 6; row += 1) ctx.fillRect(Math.round(x - w / 2), Math.round(y - h + row * 15 * z), Math.round(w), 1);
    ctx.fillStyle = "#ffd57a";
    [-0.32, -0.08, 0.16].forEach((offset) => {
      ctx.fillRect(Math.round(x + offset * w), Math.round(y - h * 0.68), Math.round(26 * z), Math.round(22 * z));
    });
    ctx.fillStyle = "#3b2414";
    ctx.fillRect(Math.round(x + 0.32 * w), Math.round(y - h * 0.62), Math.round(24 * z), Math.round(h * 0.62));
    ctx.fillStyle = "#f2f7ff";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.6, y - h);
    ctx.lineTo(x, y - h - 70 * z);
    ctx.lineTo(x + w * 0.6, y - h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c9d6ec";
    ctx.fillRect(Math.round(x - w * 0.6), Math.round(y - h - 2 * z), Math.round(w * 1.2), Math.max(1, Math.round(4 * z)));
    ctx.fillStyle = "#6b6f7a";
    ctx.fillRect(Math.round(x + w * 0.22), Math.round(y - h - 62 * z), Math.round(14 * z), Math.round(34 * z));
  }

  /* ---------- Screen-space effects ---------- */

  drawSnowfall(time, dt) {
    const { ctx, W, H, camera } = this;
    const still = this.reducedMotion;
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    this.flakes.forEach((flake) => {
      if (!still) {
        flake.y += flake.fall * dt - camera.dy * camera.zoom * 0.7;
        flake.x += Math.sin(time + flake.phase) * 6 * dt - camera.dx * camera.zoom * 0.7;
        flake.x = ((flake.x % W) + W) % W;
        flake.y = ((flake.y % H) + H) % H;
      }
      ctx.fillRect(Math.round(flake.x), Math.round(flake.y), flake.size, flake.size);
    });
  }

  drawSpeedLines(time, speedNorm, angle) {
    if (this.reducedMotion || speedNorm < 0.35) return;
    const { ctx, W, H } = this;
    const strength = smoothRange(speedNorm, 0.35, 0.9);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 * strength})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.streaks.forEach((streak) => {
      const travel = (time * 2.4 + streak.phase) % 1;
      const x = W * (1.1 - travel * 1.3);
      const y = H * streak.y + (x - W / 2) * (dy / dx);
      const len = W * 0.08 * streak.len * strength;
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx * len, y + dy * len);
    });
    ctx.stroke();
  }

  /* Cinematic bars while airborne: the "slow-mo" cue. */
  drawLetterbox(airEnv) {
    if (airEnv <= 0.01) return;
    const { ctx, W, H } = this;
    const bar = Math.round(H * 0.07 * airEnv);
    ctx.fillStyle = "rgba(8, 10, 30, 0.85)";
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
  }
}
