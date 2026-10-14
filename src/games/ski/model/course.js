/*
 * The mountain. Pure geometry, no DOM: given the stops, build a run between
 * each pair with a kicker and a landing, and answer "where is the skier, and
 * in what pose, at progress p?". Progress is measured in stops: 0 is the
 * start gate, 1 is chapter one, ..., stopCount - 1 is the finish.
 *
 * World units: x grows to the right (downhill), y grows down.
 */
import { clamp, lerp, seededRandom, smoothRange, smoothstep } from "../../shared/math";
import { REST_POSE, trickForJump } from "./tricks";

export const RUN_LENGTH = 1400;
export const KICKER = { start: 0.4, lip: 0.5, end: 0.508, height: 80 };
export const LANDING = 0.8;
export const AIR_HEIGHT = 170;

const SLOPE = { stop: 0.16, run: 0.52, landing: 0.64 };
const SUMMIT = 950;
const RUN_OUT = 1500;
const STEP = 4;
const TOP_FT = 11000;
const BASE_FT = 7760;

/*
 * Scroll progress within one run -> position along that run. The air gets
 * almost half the scroll so tricks have room to read; the run-in is quick.
 */
export const PACE = [
  [0, 0],
  [0.28, KICKER.lip],
  [0.76, LANDING],
  [1, 1],
];
export const TOUCHDOWN = PACE[2][0];

export function paceRun(f) {
  const t = clamp(f, 0, 1);
  for (let i = 1; i < PACE.length; i += 1) {
    const [f1, u1] = PACE[i];
    if (t <= f1) {
      const [f0, u0] = PACE[i - 1];
      return lerp(u0, u1, (t - f0) / (f1 - f0));
    }
  }
  return 1;
}

export function createCourse(stops) {
  const stopCount = stops.length;
  const runCount = stopCount - 1;
  const finishX = runCount * RUN_LENGTH;
  const startX = -SUMMIT;
  const endX = finishX + RUN_OUT;

  const jumps = Array.from({ length: runCount }, (_, index) => ({
    index,
    startX: (index + KICKER.start) * RUN_LENGTH,
    lipX: (index + KICKER.lip) * RUN_LENGTH,
    landX: (index + LANDING) * RUN_LENGTH,
    trick: trickForJump(index, runCount),
  }));

  function slopeAt(x) {
    if (x < 0) {
      // Steep back side, a flat summit, then a gentle roll into the start gate.
      return (
        lerp(-0.75, 0, smoothRange(x, -SUMMIT * 0.75, -SUMMIT * 0.4)) +
        SLOPE.stop * smoothRange(x, -220, 0)
      );
    }
    if (x >= finishX) return SLOPE.stop * (1 - smoothRange(x - finishX, 0, 400));
    const u = x / RUN_LENGTH - Math.floor(x / RUN_LENGTH);
    return (
      SLOPE.stop +
      (SLOPE.run - SLOPE.stop) * smoothRange(u, 0.06, 0.24) +
      (SLOPE.landing - SLOPE.run) * smoothRange(u, 0.47, 0.56) +
      (SLOPE.stop - SLOPE.landing) * smoothRange(u, 0.84, 0.95)
    );
  }

  const sampleCount = Math.ceil((endX - startX) / STEP) + 1;
  const heights = new Float64Array(sampleCount);
  for (let i = 1; i < sampleCount; i += 1) {
    const x0 = startX + (i - 1) * STEP;
    heights[i] = heights[i - 1] + ((slopeAt(x0) + slopeAt(x0 + STEP)) / 2) * STEP;
  }

  function baseY(x) {
    if (x <= startX) return heights[0] + (x - startX) * slopeAt(startX);
    const last = sampleCount - 1;
    const index = (x - startX) / STEP;
    if (index >= last) return heights[last];
    const i = Math.floor(index);
    return lerp(heights[i], heights[i + 1], index - i);
  }

  function kickerBump(x) {
    if (x < 0 || x >= finishX) return 0;
    const u = x / RUN_LENGTH - Math.floor(x / RUN_LENGTH);
    if (u >= KICKER.start && u <= KICKER.lip) {
      return KICKER.height * ((u - KICKER.start) / (KICKER.lip - KICKER.start)) ** 1.8;
    }
    if (u > KICKER.lip && u < KICKER.end) {
      return KICKER.height * (1 - (u - KICKER.lip) / (KICKER.end - KICKER.lip));
    }
    return 0;
  }

  const groundY = (x) => baseY(x) - kickerBump(x);
  const angleAt = (x) => Math.atan((groundY(x + 2) - groundY(x - 2)) / 4);
  const stopX = (index) => index * RUN_LENGTH;

  const topY = groundY(0);
  const bottomY = groundY(finishX);
  const elevationAt = (y) => TOP_FT - ((y - topY) / (bottomY - topY)) * (TOP_FT - BASE_FT);

  function poseAt(progress) {
    const p = clamp(progress, 0, runCount);
    const run = Math.min(Math.floor(p), runCount - 1);
    const u = paceRun(p - run);
    const x = (run + u) * RUN_LENGTH;
    const jump = jumps[run];

    if (u > KICKER.lip && u < LANDING) {
      const s = (u - KICKER.lip) / (LANDING - KICKER.lip);
      const arc = 4 * AIR_HEIGHT * s * (1 - s);
      const line = lerp(groundY(jump.lipX), groundY(jump.landX), s);
      return {
        x,
        y: line - arc,
        angle: lerp(angleAt(jump.lipX - 3), angleAt(jump.landX), smoothstep(s)),
        airborne: true,
        air: s,
        run,
        jump,
        pose: jump.trick.pose(s),
        focusY: line - arc * 0.5,
      };
    }
    const y = groundY(x);
    return {
      x,
      y,
      angle: angleAt(x),
      airborne: false,
      air: 0,
      run,
      jump: null,
      pose: REST_POSE,
      focusY: y,
    };
  }

  const rand = seededRandom(1818);
  const trees = [];
  for (let x = startX + 40; x < endX; x += 46 + rand() * 110) {
    const u = x / RUN_LENGTH - Math.floor(x / RUN_LENGTH);
    const onCourse = x > 0 && x < finishX;
    const nearStop = Math.abs(x - Math.round(x / RUN_LENGTH) * RUN_LENGTH) < 110;
    const front = rand() < 0.24;
    const size = 0.7 + rand() * 0.6;
    const tint = rand();
    const depth = 60 + rand() * 90;
    if (nearStop && x > -200) continue;
    if (!front && onCourse && u > 0.34 && u < 0.88) continue;
    if (x > -SUMMIT * 0.42 && x < 0) continue;
    if (x > finishX + 380 && x < finishX + 760) continue;
    trees.push({ x, size: front ? size * 1.3 : size, front, tint, depth: front ? depth : 4 });
  }

  return {
    stops,
    stopCount,
    runCount,
    runLength: RUN_LENGTH,
    startX,
    endX,
    finishX,
    jumps,
    trees,
    baseY,
    groundY,
    kickerBump,
    angleAt,
    stopX,
    elevationAt,
    poseAt,
  };
}
