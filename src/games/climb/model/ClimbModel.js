/*
 * Game state for the climb. The controller feeds it a target (where the
 * scroll wants the climber) and a clock; the model decides how the climber
 * gets there: start moving, climb at a steady pace, settle at the anchor.
 *
 * Outputs:
 *   frame          per-tick data for the renderer
 *   getSnapshot()  coarse, quantized state for the React HUD
 */
import { clamp } from "../../shared/math";
import { SENT, STAND_HIP } from "./route";

const ACCEL = 1.4; // stops / s^2
const CRUISE = 0.42; // stops / s, before catching up on long scrolls
const CARD_DISTANCE = 0.05;
const CARD_MAX_VELOCITY = 0.3;
const REWIND_VELOCITY = -0.08;

export default class ClimbModel {
  constructor(route) {
    this.route = route;
    this.stopCount = route.stopCount;
    this.reducedMotion = false;
    this.target = 0;
    this.progress = 0;
    this.velocity = 0;
    this.maxProgress = 0;
    this.downclimbed = false;
    this.time = 0;
    this.pose = route.poseAt(0, 0);
    this.frame = this.buildFrame();
    this.snapshot = this.buildSnapshot();
  }

  get lastStop() {
    return this.stopCount - 1;
  }

  setTarget(value) {
    this.target = clamp(value, 0, this.lastStop);
  }

  /* Jump straight to a spot (first load, "climb again"); resets the tally. */
  teleport(value) {
    this.setTarget(value);
    this.progress = this.target;
    this.velocity = 0;
    this.maxProgress = this.progress;
    this.downclimbed = false;
    this.pose = this.route.poseAt(this.progress, this.time);
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
      // Catch up only when more than one stop behind (long scrolls, warps).
      const cruise = CRUISE + Math.max(0, Math.abs(gap) - 1) * 0.9;
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

    if (this.velocity < REWIND_VELOCITY) this.downclimbed = true;
    this.maxProgress = Math.max(this.maxProgress, this.progress);
    this.pose = this.route.poseAt(this.progress, this.time);
    this.frame = this.buildFrame();
    this.snapshot = this.buildSnapshot();
  }

  buildFrame() {
    return {
      time: this.time,
      progress: this.progress,
      velocity: this.velocity,
      maxProgress: this.maxProgress,
      pose: this.pose,
    };
  }

  /* A pitch counts as sent once the climber has been near its top. */
  sentPitches() {
    return this.route.pitches.filter((pitch) => this.maxProgress >= pitch.index + SENT);
  }

  score() {
    return this.sentPitches().reduce((total, pitch) => total + pitch.points, 0);
  }

  buildSnapshot() {
    const nearest = Math.round(this.progress);
    const atStop = Math.abs(this.progress - nearest) < CARD_DISTANCE && Math.abs(this.velocity) < CARD_MAX_VELOCITY;
    const activeStop = atStop ? nearest : -1;

    const pitchIndex = Math.min(Math.floor(this.progress), this.lastStop - 1);
    const f = this.progress - pitchIndex;
    const { pose } = this;
    const climbing = this.velocity > 0;
    const fall = pose.falling && climbing;
    const crux = pose.crux && climbing;
    const sent = climbing && f >= SENT && f < 1 ? pitchIndex : -1;
    const rewinding = this.velocity < REWIND_VELOCITY;
    const score = this.score();

    return {
      phaseKey: `${activeStop}|${crux}|${fall}|${sent}|${rewinding}|${score}`,
      activeStop,
      nearestStop: nearest,
      // At an anchor, the pitch just climbed (it matches the card there).
      pitch: clamp(Math.ceil(this.progress) - 1, 0, this.lastStop - 1),
      crux,
      fall,
      sent,
      rewinding,
      score,
      sentCount: this.sentPitches().length,
      downclimbed: this.downclimbed,
      height: Math.round(this.route.heightFt(pose.hip.y - STAND_HIP) / 5) * 5,
      progress: Math.round((this.progress / this.lastStop) * 400) / 400,
    };
  }

  getSnapshot() {
    return this.snapshot;
  }
}
