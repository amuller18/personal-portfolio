/*
 * The mountain. Pure geometry, no DOM: given the stops, lay out one run
 * between each pair and answer "where is the skier, and in what pose, at
 * progress p?". Progress is measured in stops: 0 is the summit start,
 * 1 is chapter one, ..., stopCount - 1 is the finish.
 *
 * A run is one of
 *   walk     skis on the shoulder, walk over, drop them, step in, shuffle on
 *   lift     skate to a chairlift, ride it up, unload, skate to the next stop
 *   descent  ski down with a kicker, a trick in the air, and a landing
 *
 * Every phase change blends smoothly (no corners in position over progress),
 * so scrolling never produces a jolt.
 *
 * World units: x grows to the right (downhill), y grows down.
 */
import { clamp, lerp, monotoneCubic, seededRandom, smoothRange, smoothstep } from "../../shared/math";
import { REST_POSE, trickForJump } from "./tricks";

export const RUN_LENGTH = 1400;
export const LIFT_LENGTH = 2000;
export const WALK_LENGTH = 420;
export const KICKER = { start: 0.4, lip: 0.5, end: 0.508, height: 80 };
export const LANDING = 0.8;
export const AIR_HEIGHT = 170;

/*
 * Lift runs, as fractions of the run's progress and local x positions.
 * `seat` is the hip height while seated, so the boots touch the snow exactly
 * at the load and unload points.
 */
export const LIFT = {
  load: 0.08,
  ride: 0.8,
  unload: 0.88,
  loadX: 70,
  unloadX: 1680,
  offX: 1760,
  seat: 30,
  rise: 150,
  hanger: 44,
  pace: 0.38,
};

/* Stops reached on foot or by chairlift instead of skiing down. Keyed by id. */
export const DEFAULT_WALK_STOPS = ["hustle"];
export const DEFAULT_LIFT_STOPS = ["telaviv"];

/* Walk runs, as fractions of the run's progress -> local x. */
const WALK_PATH = monotoneCubic([
  [0, 0],
  [0.6, 300],
  [0.82, 306],
  [1, WALK_LENGTH],
]);
const WALK = { carryEnd: 0.6, dropEnd: 0.8 };

const SLOPE = { stop: 0.16, run: 0.52, landing: 0.64, climb: -0.6 };
const BASE_AREA = 950;
const RUN_OUT = 1500;
const STEP = 4;
export const TOP_FT = 11000;
export const BASE_FT = 7760;

/*
 * Scroll progress within a descent -> position along it. The air gets almost
 * half the scroll so tricks have room to read; the run-in is quick.
 */
export const PACE = [
  [0, 0],
  [0.28, KICKER.lip],
  [0.76, LANDING],
  [1, 1],
];
export const TAKEOFF = PACE[1][0];
export const TOUCHDOWN = PACE[2][0];

const paceCurve = monotoneCubic(PACE);
export const paceRun = (f) => paceCurve(clamp(f, 0, 1));

export function createCourse(stops, { walkStops = DEFAULT_WALK_STOPS, liftStops = DEFAULT_LIFT_STOPS } = {}) {
  const stopCount = stops.length;
  const runCount = stopCount - 1;
  const walked = new Set(walkStops);
  const lifted = new Set(liftStops);
  const LENGTHS = { walk: WALK_LENGTH, lift: LIFT_LENGTH, descent: RUN_LENGTH };
  const PACES = { walk: 0.55, lift: LIFT.pace, descent: 1 };

  /* ---------- Layout ---------- */

  const runs = [];
  let cursor = 0;
  for (let i = 0; i < runCount; i += 1) {
    const next = stops[i + 1].id;
    const type = walked.has(next) ? "walk" : lifted.has(next) ? "lift" : "descent";
    const length = LENGTHS[type];
    const previous = runs[i - 1];
    runs.push({
      index: i,
      type,
      start: cursor,
      end: cursor + length,
      length,
      startSlope: previous && previous.type === "descent" ? SLOPE.stop : 0,
      pace: PACES[type],
      jump: null,
    });
    cursor += length;
  }

  const descents = runs.filter((run) => run.type === "descent");
  const jumps = descents.map((run, index) => {
    const jump = {
      index,
      run: run.index,
      startX: run.start + KICKER.start * RUN_LENGTH,
      lipX: run.start + KICKER.lip * RUN_LENGTH,
      landX: run.start + LANDING * RUN_LENGTH,
      takeoff: TAKEOFF,
      touchdown: TOUCHDOWN,
      trick: trickForJump(index, descents.length),
    };
    run.jump = jump;
    return jump;
  });

  const stopXs = [0, ...runs.map((run) => run.end)];
  const finishX = stopXs[stopXs.length - 1];
  const startX = -BASE_AREA;
  const endX = finishX + RUN_OUT;
  const lastRun = runs[runs.length - 1];
  const endSlope = lastRun.type === "lift" ? 0 : SLOPE.stop;

  function runAt(x) {
    if (x < 0 || x >= finishX) return null;
    for (let i = 0; i < runs.length; i += 1) {
      if (x < runs[i].end) return runs[i];
    }
    return null;
  }

  /* ---------- Terrain ---------- */

  function slopeAt(x) {
    // The base area is flat; the start is down here by the lift.
    if (x < 0) return 0;
    if (x >= finishX) return endSlope * (1 - smoothRange(x - finishX, 0, 400));
    const run = runAt(x);
    const local = x - run.start;
    if (run.type === "walk") return run.startSlope * (1 - smoothRange(local, 0, 40));
    if (run.type === "lift") {
      // Flat loading area, a long climb, then a flat top.
      return (
        run.startSlope * (1 - smoothRange(local, 0, 40)) +
        SLOPE.climb * smoothRange(local, 480, 660) * (1 - smoothRange(local, 1460, 1620))
      );
    }
    const u = local / RUN_LENGTH;
    return (
      run.startSlope +
      (SLOPE.stop - run.startSlope) * smoothRange(u, 0, 0.05) +
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

  /* Descent run + position along it (0..1), or null. */
  function descentAt(x) {
    const run = runAt(x);
    if (!run || run.type !== "descent") return null;
    return { run, u: (x - run.start) / RUN_LENGTH };
  }

  function kickerBump(x) {
    const at = descentAt(x);
    if (!at) return 0;
    const { u } = at;
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
  const stopX = (index) => stopXs[index];

  /* Between a kicker's lip and its landing: nobody touches the snow here. */
  function inAir(x) {
    const at = descentAt(x);
    return Boolean(at) && at.u > KICKER.lip - 0.002 && at.u < LANDING;
  }

  /* ---------- Chairlifts ---------- */

  /* Seat position at s (0 = loading, 1 = unloading). Follows the terrain
   * with extra clearance mid-span, so skis never clip the slope. */
  function seatAt(run, s) {
    const x = lerp(run.start + LIFT.loadX, run.start + LIFT.unloadX, s);
    const lift = LIFT.seat + LIFT.rise * Math.sin(Math.PI * clamp(s, 0, 1)) ** 0.6;
    return { x, y: groundY(x) - lift };
  }

  const lifts = runs
    .filter((run) => run.type === "lift")
    .map((run) => ({
      run: run.index,
      loadX: run.start + LIFT.loadX,
      unloadX: run.start + LIFT.unloadX,
      seatAt: (s) => seatAt(run, s),
    }));

  /* Ground is skied on (for tracks): not in the air, not on the chair. */
  function isSkied(x) {
    if (inAir(x)) return false;
    const run = runAt(x);
    if (!run) return x >= finishX;
    const local = x - run.start;
    if (run.type === "walk") return local > WALK_PATH(WALK.dropEnd);
    if (run.type === "lift") return local < LIFT.loadX || local > LIFT.unloadX;
    return true;
  }

  /* ---------- Poses ---------- */

  const grounded = (x, phase, extra = {}) => {
    const y = groundY(x);
    return {
      x,
      y,
      angle: angleAt(x),
      airborne: false,
      air: 0,
      jump: null,
      lift: null,
      pose: REST_POSE,
      focusY: y,
      phase,
      ...extra,
    };
  };

  function walkPose(run, f) {
    const local = WALK_PATH(f);
    const phase = f < WALK.carryEnd ? "walk" : f < WALK.dropEnd ? "stepin" : "shuffle";
    return {
      ...grounded(run.start + local, phase),
      run: run.index,
      pose: {
        ...REST_POSE,
        carry: 1 - smoothRange(f, WALK.carryEnd - 0.02, WALK.dropEnd - 0.04),
        walk: 1 - smoothRange(f, WALK.carryEnd - 0.12, WALK.carryEnd),
        stride: local * 0.09,
      },
    };
  }

  function liftPose(run, f) {
    const loadX = run.start + LIFT.loadX;
    const unloadX = run.start + LIFT.unloadX;
    const offX = run.start + LIFT.offX;

    if (f < LIFT.load) {
      // Skate into the loading zone; the chair swings in behind and scoops.
      const t = f / LIFT.load;
      const x = lerp(run.start, loadX, smoothstep(t));
      const sit = smoothRange(t, 0.55, 1);
      const scoop = smoothRange(t, 0.35, 1);
      const base = grounded(x, "load");
      return {
        ...base,
        run: run.index,
        pose: { ...REST_POSE, sit },
        lift: { s: 0, chairX: lerp(loadX - 110, x, scoop), chairY: lerp(base.y - 60, base.y - LIFT.seat, scoop) },
      };
    }
    if (f < LIFT.ride) {
      // Chairs ease out of the bottom station and slow into the top one.
      const s = smoothstep((f - LIFT.load) / (LIFT.ride - LIFT.load));
      const seat = seatAt(run, s);
      const y = seat.y + LIFT.seat;
      return {
        x: seat.x,
        y,
        angle: 0,
        airborne: false,
        air: 0,
        run: run.index,
        jump: null,
        pose: { ...REST_POSE, sit: 1 },
        lift: { s, chairX: seat.x, chairY: seat.y },
        focusY: y - 30,
        phase: "lift",
      };
    }
    if (f < LIFT.unload) {
      // Stand up and slide down the off-ramp; the chair carries on.
      const t = (f - LIFT.ride) / (LIFT.unload - LIFT.ride);
      const x = lerp(unloadX, offX, smoothstep(t));
      const base = grounded(x, "unload");
      return {
        ...base,
        run: run.index,
        pose: { ...REST_POSE, sit: 1 - smoothRange(t, 0, 0.6) },
        lift: { s: 1, chairX: lerp(unloadX, unloadX + 90, t), chairY: groundY(unloadX) - LIFT.seat - 50 * t },
      };
    }
    const t = (f - LIFT.unload) / (1 - LIFT.unload);
    return { ...grounded(lerp(offX, run.end, smoothstep(t)), "skate"), run: run.index };
  }

  function descentPose(run, f) {
    const u = paceRun(f);
    const x = run.start + u * RUN_LENGTH;
    const { jump } = run;

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
        run: run.index,
        jump,
        lift: null,
        pose: jump.trick.pose(s),
        focusY: line - arc * 0.5,
        phase: "air",
      };
    }
    return { ...grounded(x, u >= LANDING ? "runout" : "runin"), run: run.index };
  }

  function poseAt(progress) {
    const p = clamp(progress, 0, runCount);
    const index = Math.min(Math.floor(p), runCount - 1);
    const run = runs[index];
    const f = p - index;
    if (run.type === "walk") return walkPose(run, f);
    return run.type === "lift" ? liftPose(run, f) : descentPose(run, f);
  }

  /* ---------- Elevation ---------- */

  const topY = Math.min(...stopXs.map((x) => groundY(x)));
  const bottomY = groundY(finishX);
  const elevationAt = (y) => TOP_FT - ((y - topY) / (bottomY - topY)) * (TOP_FT - BASE_FT);

  /* ---------- Scenery (2D view) ---------- */

  const rand = seededRandom(1818);
  const trees = [];
  for (let x = startX + 40; x < endX; x += 46 + rand() * 110) {
    const at = descentAt(x);
    const nearStop = stopXs.some((sx) => Math.abs(x - sx) < 110);
    const front = rand() < 0.24;
    const size = 0.7 + rand() * 0.6;
    const tint = rand();
    const depth = 60 + rand() * 90;
    if (nearStop && x > -200) continue;
    if (!front && at && at.u > 0.34 && at.u < 0.88) continue;
    if (x > finishX + 380 && x < finishX + 760) continue;
    trees.push({ x, size: front ? size * 1.3 : size, front, tint, depth: front ? depth : 4 });
  }

  return {
    stops,
    stopCount,
    runCount,
    runs,
    runLength: RUN_LENGTH,
    startX,
    endX,
    finishX,
    jumps,
    lifts,
    trees,
    runAt,
    descentAt,
    baseY,
    groundY,
    kickerBump,
    angleAt,
    stopX,
    inAir,
    isSkied,
    elevationAt,
    poseAt,
  };
}
