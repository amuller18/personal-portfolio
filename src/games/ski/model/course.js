/*
 * The mountain. Pure geometry, no DOM: given the stops, lay out one run
 * between each pair and answer "where is the skier, and in what pose, at
 * progress p?". Progress is measured in stops: 0 is the intro by the lift,
 * 1 is chapter one, ..., stopCount - 1 is the finish.
 *
 * A run is one of
 *   walk     skis on the shoulder, walk over, drop them, step in, shuffle on
 *   lift     skate to a chairlift, ride it up, unload, skate to the next stop
 *   glade    weave through the trees down to a trail sign
 *   cliff    ski to an edge, drop it, crash, tumble, end up sprawled
 *   descent  ski down with a kicker, a trick in the air, and a landing
 *   lodge    a descent, then skis off and walk into the mid-mountain lodge
 * A descent can open with a short preamble: getting up after the crash
 * ("recover") or walking back out of the lodge ("lodgeExit").
 *
 * Every phase change blends smoothly (no corners in position over progress),
 * so scrolling never produces a jolt.
 *
 * World units: x grows to the right (downhill), y grows down, z across the
 * slope (the skier stays near z = 0 except in the glade and at the lodge).
 */
import { clamp, lerp, monotoneCubic, seededRandom, smoothRange, smoothstep } from "../../shared/math";
import { REST_POSE, trickForJump } from "./tricks";

export const RUN_LENGTH = 1400;
export const LIFT_LENGTH = 2000;
export const WALK_LENGTH = 420;
export const GLADE_LENGTH = 1700;
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
  hanger: 60,
  pace: 0.38,
};

/* The cliff run, in local x and run progress. The drop starts at `lip`. */
export const CLIFF = {
  length: 1500,
  lip: 694,
  impact: 940,
  rest: 1440,
  approach: 0.4,
  fall: 0.52,
  tumble: 0.82,
  skiX: 70,
  skiZ: -40,
};

/* The mid-mountain lodge at the end of a lodge run. */
export const LODGE = {
  apron: 320,
  frontZ: -170,
  depth: 440,
  width: 620,
  doorWidth: 84,
  insideZ: -250,
  descent: 0.7,
  skate: 0.8,
  stepOut: 0.86,
};

/* How each chapter is reached. Anything not listed is skied (descent). */
export const DEFAULT_ROUTE = {
  hustle: "walk",
  telaviv: "lift",
  offline: "glade",
  tutormatch: "cliff",
  wolfe: "lodge",
};

/* Walk runs, as fractions of the run's progress -> local x. */
const WALK_PATH = monotoneCubic([
  [0, 0],
  [0.6, 300],
  [0.82, 306],
  [1, WALK_LENGTH],
]);
const WALK = { carryEnd: 0.6, dropEnd: 0.8 };
const CLIFF_APPROACH = monotoneCubic([
  [0, 0],
  [0.7, CLIFF.lip * 0.82],
  [1, CLIFF.lip],
]);

const PRE = { recover: 0.12, lodgeExit: 0.22 };
const SLOPE = { stop: 0.16, run: 0.52, landing: 0.64, climb: -0.6, glade: 0.38 };
const END_SLOPE = { walk: 0, lift: 0, descent: SLOPE.stop, glade: SLOPE.stop, cliff: SLOPE.stop, lodge: 0 };
const PACES = { walk: 0.55, lift: LIFT.pace, glade: 0.7, cliff: 0.5, descent: 1, lodge: 0.8 };
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

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/* Lateral weave through the glade, 0 at both ends. */
export function gladeZ(local) {
  const envelope = smoothRange(local, 80, 260) * (1 - smoothRange(local, GLADE_LENGTH - 320, GLADE_LENGTH - 120));
  return 75 * Math.sin((2 * Math.PI * local) / 480) * envelope;
}

export function createCourse(stops, { route = DEFAULT_ROUTE } = {}) {
  const stopCount = stops.length;
  const runCount = stopCount - 1;

  /* ---------- Layout ---------- */

  const LENGTHS = {
    walk: WALK_LENGTH,
    lift: LIFT_LENGTH,
    glade: GLADE_LENGTH,
    cliff: CLIFF.length,
    descent: RUN_LENGTH,
    lodge: RUN_LENGTH + LODGE.apron,
  };

  const runs = [];
  let cursor = 0;
  for (let i = 0; i < runCount; i += 1) {
    const type = route[stops[i + 1].id] || "descent";
    const previous = runs[i - 1];
    let pre = null;
    if (type === "descent" && previous && previous.type === "cliff") pre = "recover";
    if (type === "descent" && previous && previous.type === "lodge") pre = "lodgeExit";
    runs.push({
      index: i,
      type,
      pre,
      start: cursor,
      end: cursor + LENGTHS[type],
      length: LENGTHS[type],
      startSlope: previous ? END_SLOPE[previous.type] : 0,
      pace: PACES[type],
      jump: null,
    });
    cursor += LENGTHS[type];
  }

  /* Where the descent part of a run sits in its progress (0..1). */
  const descentSpan = (run) => {
    if (run.type === "lodge") return [0, LODGE.descent];
    if (run.pre) return [PRE[run.pre], 1];
    return [0, 1];
  };
  const hasKicker = (run) => run.type === "descent" || run.type === "lodge";

  const kickerRuns = runs.filter(hasKicker);
  const jumps = kickerRuns.map((run, index) => {
    const [a, b] = descentSpan(run);
    const jump = {
      index,
      run: run.index,
      startX: run.start + KICKER.start * RUN_LENGTH,
      lipX: run.start + KICKER.lip * RUN_LENGTH,
      landX: run.start + LANDING * RUN_LENGTH,
      takeoff: lerp(a, b, TAKEOFF),
      touchdown: lerp(a, b, TOUCHDOWN),
      trick: trickForJump(index, kickerRuns.length),
    };
    run.jump = jump;
    return jump;
  });

  runs
    .filter((run) => run.type === "cliff")
    .forEach((run) => {
      run.cliff = {
        lipX: run.start + CLIFF.lip,
        impactX: run.start + CLIFF.impact,
        restX: run.start + CLIFF.rest,
        skiX: run.end + CLIFF.skiX,
        skiZ: CLIFF.skiZ,
      };
    });
  runs
    .filter((run) => run.type === "lodge")
    .forEach((run) => {
      run.lodge = { x: run.end, frontZ: LODGE.frontZ, insideZ: LODGE.insideZ };
    });

  const stopXs = [0, ...runs.map((run) => run.end)];
  const finishX = stopXs[stopXs.length - 1];
  const startX = -BASE_AREA;
  const endX = finishX + RUN_OUT;
  const lastRun = runs[runs.length - 1];
  const endSlope = END_SLOPE[lastRun.type];

  function runAt(x) {
    if (x < 0 || x >= finishX) return null;
    for (let i = 0; i < runs.length; i += 1) {
      if (x < runs[i].end) return runs[i];
    }
    return null;
  }

  /* ---------- Terrain ---------- */

  function descentSlope(u, startSlope) {
    return (
      startSlope +
      (SLOPE.stop - startSlope) * smoothRange(u, 0, 0.05) +
      (SLOPE.run - SLOPE.stop) * smoothRange(u, 0.06, 0.24) +
      (SLOPE.landing - SLOPE.run) * smoothRange(u, 0.47, 0.56) +
      (SLOPE.stop - SLOPE.landing) * smoothRange(u, 0.84, 0.95)
    );
  }

  function slopeAt(x) {
    // The base area is flat; the intro happens down here by the lift.
    if (x < 0) return 0;
    if (x >= finishX) return endSlope * (1 - smoothRange(x - finishX, 0, 400));
    const run = runAt(x);
    const l = x - run.start;
    const L = run.length;
    switch (run.type) {
      case "walk":
        return run.startSlope * (1 - smoothRange(l, 0, 40));
      case "lift":
        // Flat loading area, a long climb, then a flat top.
        return (
          run.startSlope * (1 - smoothRange(l, 0, 40)) +
          SLOPE.climb * smoothRange(l, 480, 660) * (1 - smoothRange(l, 1460, 1620))
        );
      case "glade":
        return (
          run.startSlope +
          (SLOPE.glade - run.startSlope) * smoothRange(l, 40, 240) +
          (SLOPE.stop - SLOPE.glade) * smoothRange(l, L - 320, L - 140)
        );
      case "cliff":
        // Approach, a flat lip, a near-vertical drop, a steep landing.
        return (
          run.startSlope +
          (0.3 - run.startSlope) * smoothRange(l, 0, 80) +
          (0.08 - 0.3) * smoothRange(l, 640, 686) +
          (4.3 - 0.08) * smoothRange(l, CLIFF.lip - 2, CLIFF.lip + 10) +
          (0.45 - 4.3) * smoothRange(l, CLIFF.lip + 58, CLIFF.lip + 72) +
          (SLOPE.stop - 0.45) * smoothRange(l, 1280, 1420)
        );
      case "lodge":
        if (l < RUN_LENGTH) return descentSlope(l / RUN_LENGTH, run.startSlope);
        return SLOPE.stop * (1 - smoothRange(l - RUN_LENGTH, 0, 120));
      default:
        return descentSlope(l / RUN_LENGTH, run.startSlope);
    }
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

  /* Run with a kicker + position along its descent part (0..1), or null. */
  function descentAt(x) {
    const run = runAt(x);
    if (!run || !hasKicker(run)) return null;
    const local = x - run.start;
    if (local > RUN_LENGTH) return null;
    return { run, u: local / RUN_LENGTH };
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

  /* Where the rider's line runs across the slope (for tracks and trees). */
  function lineZ(x) {
    const run = runAt(x);
    return run && run.type === "glade" ? gladeZ(x - run.start) : 0;
  }

  /* Flat building pads the 3D terrain is levelled to (lodge and its apron). */
  const pads = runs
    .filter((run) => run.type === "lodge")
    .map((run) => ({
      x0: run.end - LODGE.width / 2 - 80,
      x1: run.end + LODGE.width / 2 + 80,
      z0: LODGE.frontZ - LODGE.depth - 80,
      z1: 60,
    }));

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

  /* Ground is skied on (for tracks): not in the air, not on the chair,
   * not walked on, and not where the rider tumbled. */
  function isSkied(x) {
    if (inAir(x)) return false;
    const run = runAt(x);
    if (!run) return x >= finishX;
    const local = x - run.start;
    if (run.type === "walk") return local > WALK_PATH(WALK.dropEnd);
    if (run.type === "lift") return local < LIFT.loadX || local > LIFT.unloadX;
    if (run.type === "cliff") return local < CLIFF.lip;
    if (run.type === "lodge") return local < RUN_LENGTH + LODGE.apron * 0.5;
    return true;
  }

  /* ---------- Poses ---------- */

  const grounded = (x, phase, extra = {}) => {
    const y = groundY(x);
    return {
      x,
      y,
      z: lineZ(x),
      yaw: 0,
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
        ...grounded(seat.x, "lift"),
        y,
        angle: 0,
        run: run.index,
        pose: { ...REST_POSE, sit: 1 },
        lift: { s, chairX: seat.x, chairY: seat.y },
        focusY: y - 30,
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

  function gladePose(run, f) {
    const local = f * run.length;
    const x = run.start + local;
    const dz = gladeZ(local + 2) - gladeZ(local - 2);
    return {
      ...grounded(x, "glade"),
      run: run.index,
      yaw: -Math.atan2(dz, 4),
    };
  }

  function cliffPose(run, f) {
    const { lipX, impactX, restX } = run.cliff;
    if (f < CLIFF.approach) {
      return { ...grounded(run.start + CLIFF_APPROACH(f / CLIFF.approach), "cliff-approach"), run: run.index };
    }
    if (f < CLIFF.fall) {
      // Off the edge: a small pop, then gravity wins.
      const s = (f - CLIFF.approach) / (CLIFF.fall - CLIFF.approach);
      const x = lerp(lipX, impactX, s);
      const y = lerp(groundY(lipX), groundY(impactX), s * s) - 36 * s * (1 - s);
      return {
        ...grounded(x, "cliff-air"),
        y,
        angle: 0.35 * s,
        airborne: true,
        air: s,
        run: run.index,
        pose: { ...REST_POSE, arms: smoothRange(s, 0.2, 0.8), tuck: 0.3 * s },
        focusY: y - 40,
      };
    }
    if (f < CLIFF.tumble) {
      // Yard sale: front flips that run out of steam, bounces that shrink.
      const t = (f - CLIFF.fall) / (CLIFF.tumble - CLIFF.fall);
      const x = lerp(impactX, restX, easeOutCubic(t));
      const bounce = 46 * Math.abs(Math.sin(3 * Math.PI * t)) * (1 - t) ** 2;
      const base = grounded(x, "tumble");
      return {
        ...base,
        y: base.y - bounce,
        run: run.index,
        pose: {
          ...REST_POSE,
          rotation: 720 * easeOutCubic(t),
          spin: easeOutCubic(t),
          tuck: 0.7 * (1 - t),
          split: 0.5 * Math.sin(Math.PI * t),
          arms: 0.8 * Math.sin(Math.PI * t * 5) ** 2 * (1 - t),
          lostSki: smoothRange(t, 0.04, 0.12),
          sprawl: smoothRange(t, 0.8, 1) * 0.6,
        },
        focusY: base.y - bounce,
      };
    }
    // Slide to a stop and sit there, one ski short.
    const t = (f - CLIFF.tumble) / (1 - CLIFF.tumble);
    return {
      ...grounded(lerp(restX, run.end, smoothstep(t)), "rest"),
      run: run.index,
      pose: { ...REST_POSE, rotation: 720, spin: 1, lostSki: 1, sprawl: lerp(0.6, 1, smoothstep(t)) },
    };
  }

  function descentPose(run, g, phaseOverride) {
    const u = paceRun(g);
    const x = run.start + u * RUN_LENGTH;
    const { jump } = run;

    if (u > KICKER.lip && u < LANDING) {
      const s = (u - KICKER.lip) / (LANDING - KICKER.lip);
      const arc = 4 * AIR_HEIGHT * s * (1 - s);
      const line = lerp(groundY(jump.lipX), groundY(jump.landX), s);
      return {
        ...grounded(x, "air"),
        y: line - arc,
        angle: lerp(angleAt(jump.lipX - 3), angleAt(jump.landX), smoothstep(s)),
        airborne: true,
        air: s,
        run: run.index,
        jump,
        pose: jump.trick.pose(s),
        focusY: line - arc * 0.5,
      };
    }
    return { ...grounded(x, phaseOverride || (u >= LANDING ? "runout" : "runin")), run: run.index };
  }

  function recoverPose(run, f) {
    // Get up, dust off, grab the ski back.
    const t = f / PRE.recover;
    return {
      ...grounded(run.start, "recover"),
      run: run.index,
      pose: { ...REST_POSE, sprawl: 1 - smoothRange(t, 0, 0.6), lostSki: 1 - smoothRange(t, 0.55, 0.95) },
    };
  }

  function lodgePose(run, f) {
    const lodgeX = run.end;
    if (f < LODGE.descent) return descentPose(run, f / LODGE.descent);
    if (f < LODGE.skate) {
      const t = (f - LODGE.descent) / (LODGE.skate - LODGE.descent);
      return { ...grounded(lerp(run.start + RUN_LENGTH, lodgeX, smoothstep(t)), "lodge-skate"), run: run.index };
    }
    if (f < LODGE.stepOut) {
      const t = (f - LODGE.skate) / (LODGE.stepOut - LODGE.skate);
      return { ...grounded(lodgeX, "stepout"), run: run.index, pose: { ...REST_POSE, noSkis: smoothstep(t) } };
    }
    // Walk in through the door toward the menu.
    const t = (f - LODGE.stepOut) / (1 - LODGE.stepOut);
    const z = lerp(0, LODGE.insideZ, smoothstep(t));
    return {
      ...grounded(lodgeX, "walkin"),
      z,
      yaw: (Math.PI / 2) * smoothRange(t, 0, 0.25),
      run: run.index,
      pose: { ...REST_POSE, noSkis: 1, walk: 1 - smoothRange(t, 0.85, 1), stride: -z * 0.09 },
    };
  }

  function lodgeExitPose(run, f) {
    // Turn around, walk back out, click into the skis left by the door.
    const exit = PRE.lodgeExit;
    const walkOut = exit * 0.65;
    if (f < walkOut) {
      const t = f / walkOut;
      const z = lerp(LODGE.insideZ, 0, smoothstep(smoothRange(t, 0.2, 1)));
      return {
        ...grounded(run.start, "walkout"),
        z,
        yaw: lerp(Math.PI / 2, -Math.PI / 2, smoothRange(t, 0, 0.25)),
        run: run.index,
        pose: {
          ...REST_POSE,
          noSkis: 1,
          walk: smoothRange(t, 0.15, 0.3) * (1 - smoothRange(t, 0.9, 1)),
          stride: z * 0.09,
        },
      };
    }
    const t = (f - walkOut) / (exit - walkOut);
    return {
      ...grounded(run.start, "clipin"),
      yaw: lerp(-Math.PI / 2, 0, smoothstep(t)),
      run: run.index,
      pose: { ...REST_POSE, noSkis: 1 - smoothRange(t, 0.4, 1) },
    };
  }

  function poseAt(progress) {
    const p = clamp(progress, 0, runCount);
    const index = Math.min(Math.floor(p), runCount - 1);
    const run = runs[index];
    const f = p - index;
    switch (run.type) {
      case "walk":
        return walkPose(run, f);
      case "lift":
        return liftPose(run, f);
      case "glade":
        return gladePose(run, f);
      case "cliff":
        return cliffPose(run, f);
      case "lodge":
        return lodgePose(run, f);
      default:
        if (run.pre === "recover" && f < PRE.recover) return recoverPose(run, f);
        if (run.pre === "lodgeExit" && f < PRE.lodgeExit) return lodgeExitPose(run, f);
        if (run.pre) return descentPose(run, (f - PRE[run.pre]) / (1 - PRE[run.pre]));
        return descentPose(run, f);
    }
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
    pads,
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
    lineZ,
    elevationAt,
    poseAt,
  };
}
