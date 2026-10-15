/*
 * Game state for the ski run. The controller feeds it a target (where the
 * scroll wants the skier) and a clock; the model decides how the skier gets
 * there: accelerate out of the gate, cruise, brake into the next checkpoint.
 *
 * Outputs:
 *   frame          per-tick data for the canvas renderer
 *   getSnapshot()  coarse, quantized state for the React HUD
 */
import { clamp } from "../../shared/math";

const ACCEL = 1.5; // stops / s^2
const CRUISE = 0.5; // stops / s, before catching up on long scrolls
const SPEED_TO_KMH = 0.075;
const CARD_DISTANCE = 0.05;
const CARD_MAX_VELOCITY = 0.3;
const LANDED_WINDOW = 0.14;

export default class SkiModel {
  constructor(course) {
    this.course = course;
    this.stopCount = course.stopCount;
    this.reducedMotion = false;
    this.target = 0;
    this.progress = 0;
    this.velocity = 0;
    this.maxProgress = 0;
    this.time = 0;
    this.speed = 0;
    this.skier = course.poseAt(0);
    this.frame = this.buildFrame();
    this.snapshot = this.buildSnapshot();
  }

  /* The run the skier is in, or about to enter when sitting on a stop. */
  runAt(progress, direction = 1) {
    const last = this.lastStop - 1;
    const base = Math.floor(progress);
    const index = progress === base && direction < 0 ? base - 1 : base;
    return this.course.runs[clamp(index, 0, last)];
  }

  get lastStop() {
    return this.stopCount - 1;
  }

  setTarget(value) {
    this.target = clamp(value, 0, this.lastStop);
  }

  /* Jump straight to a spot (first load, "ride again"); resets the score. */
  teleport(value) {
    this.setTarget(value);
    this.progress = this.target;
    this.velocity = 0;
    this.speed = 0;
    this.maxProgress = this.progress;
    this.skier = this.course.poseAt(this.progress);
    this.frame = this.buildFrame();
    this.snapshot = this.buildSnapshot();
  }

  step(rawDt) {
    const dt = clamp(rawDt, 0, 0.05);
    this.time += dt;

    if (this.reducedMotion) {
      this.progress = this.target;
      this.velocity = 0;
    } else {
      const gap = this.target - this.progress;
      // Lift runs scroll slower so the ride up has time to breathe.
      const runPace = this.runAt(this.progress, gap).pace;
      // Catch up only when more than one stop behind (long scrolls, warps).
      const cruise = CRUISE * runPace + Math.max(0, Math.abs(gap) - 1) * 0.9;
      const desired = Math.sign(gap) * Math.min(cruise, Math.sqrt(2 * ACCEL * Math.abs(gap)));
      const maxChange = ACCEL * 1.6 * dt;
      this.velocity += clamp(desired - this.velocity, -maxChange, maxChange);
      const next = this.progress + this.velocity * dt;
      const passed = (gap >= 0 && next >= this.target) || (gap <= 0 && next <= this.target);
      if (passed) {
        this.progress = this.target;
        this.velocity = 0;
      } else {
        this.progress = next;
      }
    }

    this.maxProgress = Math.max(this.maxProgress, this.progress);
    const previous = this.skier;
    this.skier = this.course.poseAt(this.progress);
    const moved = Math.hypot(this.skier.x - previous.x, this.skier.y - previous.y);
    const instant = dt > 0 ? moved / dt : 0;
    this.speed += (instant - this.speed) * Math.min(1, dt * 8);
    if (this.velocity === 0 && this.speed < 1) this.speed = 0;

    this.frame = this.buildFrame();
    this.snapshot = this.buildSnapshot();
  }

  buildFrame() {
    return {
      time: this.time,
      progress: this.progress,
      velocity: this.velocity,
      maxProgress: this.maxProgress,
      speed: this.speed,
      skier: this.skier,
    };
  }

  score() {
    return this.course.jumps.reduce(
      (total, jump) => (this.maxProgress >= jump.run + jump.touchdown ? total + jump.trick.points : total),
      0,
    );
  }

  landedCount() {
    return this.course.jumps.filter((jump) => this.maxProgress >= jump.run + jump.touchdown).length;
  }

  buildSnapshot() {
    const nearest = Math.round(this.progress);
    const atStop =
      Math.abs(this.progress - nearest) < CARD_DISTANCE &&
      Math.abs(this.velocity) < CARD_MAX_VELOCITY;
    const activeStop = atStop ? nearest : -1;

    const run = Math.min(Math.floor(this.progress), this.lastStop - 1);
    const f = this.progress - run;
    const { jump } = this.course.runs[run];
    const trick = this.skier.airborne ? this.skier.jump.index : -1;
    const landed =
      jump && !this.skier.airborne && this.velocity > 0 && f >= jump.touchdown && f < jump.touchdown + LANDED_WINDOW
        ? jump.index
        : -1;
    const rewinding = this.velocity < -0.08;
    const score = this.score();

    return {
      phaseKey: `${activeStop}|${trick}|${landed}|${rewinding}|${score}`,
      activeStop,
      nearestStop: nearest,
      trick,
      landed,
      rewinding,
      score,
      landedCount: this.landedCount(),
      speed: Math.round(this.speed * SPEED_TO_KMH),
      elevation: Math.round(this.course.elevationAt(this.skier.y) / 10) * 10,
      progress: Math.round((this.progress / this.lastStop) * 400) / 400,
    };
  }

  getSnapshot() {
    return this.snapshot;
  }
}
