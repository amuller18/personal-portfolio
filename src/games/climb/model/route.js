/*
 * The tower. Pure geometry, no DOM: given the stops, lay out one pitch
 * between each pair and answer "where is the climber, and where are their
 * hands and feet, at progress p?". Progress is measured in stops: 0 is the
 * base of the wall, 1 is chapter one's anchor, ..., stopCount - 1 is the
 * summit.
 *
 * A pitch climbs from one stance to the next. Stances are
 *   ground   standing at the base, chalking up
 *   hang     hanging in the harness at a bolted anchor (every chapter)
 *   summit   standing on top, arms up
 * In between, the four limbs take turns moving to new holds (right hand,
 * left foot, left hand, right foot) while the hips rise. One pitch can be a
 * "whipper": a fall onto the rope halfway up, then climbing back.
 *
 * World units (~cm): x across the wall (right is +x), y up, z out of the
 * wall toward the viewer. The wall surface is wallZ(x, y).
 */
import { clamp, lerp, monotoneCubic, seededRandom, smoothRange, smoothstep } from "../../shared/math";

export const PITCH_RISE = 350;
export const CYCLES = 7;
export const STAND_HIP = 92;
export const TORSO = 62;
export const SHOULDER_HALF = 16;
export const HIP_HALF = 9;
export const ARM = [40, 38];
export const LEG = [54, 50];
export const CLIMB_OUT = 28;
export const HANG = { below: 55, out: 52 };
export const BOLT_SPACING = 70;
export const FEET_PER_UNIT = 100 / PITCH_RISE;

/* Climbing order, and where each limb sits relative to the hips on average. */
export const LIMBS = ["rh", "lf", "lh", "rf"];
const REST = {
  rh: { x: 30, y: 88 },
  lh: { x: -30, y: 88 },
  rf: { x: 22, y: -56 },
  lf: { x: -22, y: -56 },
};
const HANDS = new Set(["rh", "lh"]);

/*
 * A pitch: leave the stance (one cycle of moves with the hips nearly still),
 * climb (the hips rise steadily), then settle into the next stance (one more
 * cycle). Moves happen between MOVES_FROM and MOVES_TO.
 */
const MOVES_FROM = 0.04;
const MOVES_TO = 0.96;
const LEAVE = 0.18;
const SETTLE = 0.86;
const MOVE_SHARE = 0.85;
const RISE = monotoneCubic([
  [0, 0],
  [LEAVE, 0.02],
  [SETTLE, 0.98],
  [1, 1],
]);

/* The whipper: fall, bounce on the rope, hang, then grab back on. */
export const WHIPPER = { fall: 0.42, caught: 0.47, settle: 0.54, regrab: 0.58, back: 0.8, drop: 150 };
export const CRUX = { from: 0.55, to: 0.68 };
export const SENT = 0.86;

/* Route names and grades per chapter; anything not listed gets a default. */
export const DEFAULT_PITCHES = {
  hustle: { name: "Hustle Crack", grade: "5.7" },
  telaviv: { name: "Inbox Overhang", grade: "5.8" },
  offline: { name: "Weekend Warrior", grade: "5.9" },
  tutormatch: { name: "Ship It Slab", grade: "5.10a", whipper: true },
  traderranker: { name: "Signal Flake", grade: "5.10c" },
  wolfe: { name: "Wall Street Corner", grade: "5.11a" },
  now: { name: "Full Circle Arete", grade: "5.11b" },
  next: { name: "Next Chapter Roof", grade: "5.11d" },
  finish: { name: "Summit Push", grade: "5.9" },
};
const FALLBACK_GRADES = ["5.6", "5.7", "5.8", "5.9", "5.10a", "5.10b", "5.10c", "5.10d", "5.11a", "5.11c", "5.12a"];

/* Points for sending a pitch: harder grades are worth more. */
export function gradePoints(grade) {
  const match = /^5\.(\d+)([a-d]?)$/.exec(grade);
  if (!match) return 100;
  const number = Number(match[1]);
  const letter = match[2] ? "abcd".indexOf(match[2]) : 0;
  return 100 + Math.max(0, number - 5) * 100 + letter * 25;
}

/* The line the route takes up the wall. */
export const routeX = (y) => 100 * Math.sin(y / 640) + 34 * Math.sin(y / 280 + 1);

/* The rock face: a tower whose sides curve away, with ribs and texture. */
const taper = (x) => -260 * (x / 900) ** 2;
export function wallZ(x, y) {
  const texture =
    6 * Math.sin(x * 0.031 + y * 0.012) * Math.sin(y * 0.027 - x * 0.008) + 3 * Math.sin(x * 0.09 - y * 0.05);
  const ribs = 3 * Math.sin(y * 0.045);
  return taper(x) + texture + ribs;
}

/* A smoothed face the body keeps its distance from (no texture bumps). */
export const bodyWallZ = (x) => taper(x) + 6;

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

/* Limbs let go and flail while falling, then dangle on the rope. */
function freeLimb(limb, hip, f, time) {
  const side = limb[0] === "r" ? 1 : -1;
  const flail = 1 - smoothRange(f, WHIPPER.caught, WHIPPER.settle);
  const wave = Math.sin(time * 16 + side) * 10 * flail;
  if (HANDS.has(limb)) return add(hip, { x: side * (26 + 14 * flail), y: 70 + 36 * flail + wave, z: 16 });
  return add(hip, { x: side * 14, y: -88 + 24 * flail - wave * 0.5, z: 12 + 10 * flail });
}

export function createRoute(stops, { pitches = DEFAULT_PITCHES } = {}) {
  const stopCount = stops.length;
  const pitchCount = stopCount - 1;
  const lastStop = stopCount - 1;
  const top = pitchCount * PITCH_RISE;
  const rand = seededRandom(5122);

  const stanceHipY = (index) => index * PITCH_RISE + STAND_HIP;
  const anchorAt = (index) => {
    const y = stanceHipY(index) + HANG.below;
    const x = routeX(y);
    return { x, y, z: wallZ(x, y) };
  };

  /* ---------- Stances ---------- */

  // Each limb in a stance is either fixed in the world or follows the hips.
  const fixed = (point) => ({ fixed: true, at: () => point });
  const follow = (offset) => ({ fixed: false, at: (hip) => add(hip, offset) });

  function stance(index) {
    const hipY = stanceHipY(index);
    if (index === 0) {
      const x = routeX(hipY);
      const z = bodyWallZ(x) + 58;
      const hip = { x, y: hipY, z };
      return {
        kind: "ground",
        hip,
        chest: { x: 0, z: -2 },
        limbs: {
          rf: fixed({ x: x + 14, y: 0, z: z - 6 }),
          lf: fixed({ x: x - 14, y: 0, z: z - 6 }),
          rh: follow({ x: 10, y: 34, z: 14 }),
          lh: follow({ x: -12, y: 22, z: 10 }),
        },
      };
    }
    if (index === lastStop) {
      // Standing just back from the lip, so the top-out stays short.
      const x = routeX(top);
      const z = wallZ(x, top) - 22;
      const hip = { x, y: top + STAND_HIP, z: z + 4 };
      return {
        kind: "summit",
        hip,
        chest: { x: 0, z: 2 },
        limbs: {
          rf: fixed({ x: x + 14, y: top, z }),
          lf: fixed({ x: x - 14, y: top, z }),
          rh: follow({ x: 46, y: 128, z: 4 }),
          lh: follow({ x: -46, y: 128, z: 4 }),
        },
      };
    }
    const anchor = anchorAt(index);
    const hip = { x: anchor.x, y: hipY, z: bodyWallZ(anchor.x) + HANG.out };
    return {
      kind: "hang",
      hip,
      anchor,
      chest: { x: 0, z: 6 },
      limbs: {
        rf: fixed({ x: hip.x + 24, y: hipY - 46, z: wallZ(hip.x + 24, hipY - 46) + 3 }),
        lf: fixed({ x: hip.x - 24, y: hipY - 40, z: wallZ(hip.x - 24, hipY - 40) + 3 }),
        rh: follow({ x: 8, y: 42, z: 14 }),
        lh: fixed({ x: anchor.x - 8, y: anchor.y - 4, z: anchor.z + 6 }),
      },
    };
  }

  const stances = Array.from({ length: stopCount }, (_, i) => stance(i));

  /* ---------- Pitches ---------- */

  function pitchInfo(index) {
    const stop = stops[index + 1];
    const config = pitches[stop.id] || {};
    return {
      name: config.name || `Pitch ${index + 1}`,
      grade: config.grade || FALLBACK_GRADES[Math.min(index, FALLBACK_GRADES.length - 1)],
      whipper: Boolean(config.whipper),
    };
  }

  /* Fall depth (0 = on route) as a fraction of the drop, for a whipper. */
  function fallShape(f) {
    const w = WHIPPER;
    if (f <= w.fall || f >= w.back) return 0;
    if (f < w.caught) return ((f - w.fall) / (w.caught - w.fall)) ** 2;
    if (f < w.settle) {
      const t = (f - w.caught) / (w.settle - w.caught);
      return 1 + 0.16 * Math.sin(Math.PI * 2 * t) * (1 - t);
    }
    return 1 - smoothRange(f, w.regrab, w.back);
  }

  /* On a whipper pitch the climb's progress pauses from the fall until the
   * regrab (hanging on the rope goes nowhere), then catches up by SETTLE. */
  function whipperTime(t) {
    const w = WHIPPER;
    if (t <= w.fall) return t;
    if (t < w.regrab) return w.fall;
    if (t < SETTLE) return w.fall + ((t - w.regrab) * (SETTLE - w.fall)) / (SETTLE - w.regrab);
    return t;
  }

  function buildPitch(index) {
    const info = pitchInfo(index);
    const from = stances[index];
    const to = stances[index + 1];
    const y0 = from.hip.y;
    const y1 = to.hip.y;

    function hipAt(f) {
      const t = clamp(f, 0, 1);
      let y = lerp(y0, y1, RISE(info.whipper ? whipperTime(t) : t));
      if (info.whipper) y -= WHIPPER.drop * fallShape(t);
      const x = routeX(y);
      const climbZ = bodyWallZ(x) + CLIMB_OUT;
      const startW = 1 - smoothRange(t, 0, LEAVE);
      const endW = smoothRange(t, SETTLE, 1);
      let z = climbZ;
      z = lerp(z, from.hip.z, startW);
      z = lerp(z, to.hip.z, endW);
      // Hanging on the rope after the fall: swing out from the wall.
      if (info.whipper)
        z += 26 * smoothRange(t, WHIPPER.fall, WHIPPER.caught) * (1 - smoothRange(t, WHIPPER.settle, WHIPPER.regrab));
      return {
        x: lerp(lerp(x, from.hip.x, startW), to.hip.x, endW),
        y,
        z,
      };
    }

    // The first and last cycles take evenly timed slots at the ends of the
    // pitch. The climbing cycles in between are spread evenly over the height
    // climbed, so each gains about the same height. A whipper skips the
    // stretch where the climber is off the wall and adds cycles to climb back.
    const windows = info.whipper
      ? [
          [LEAVE, WHIPPER.fall - 0.01],
          [WHIPPER.regrab, SETTLE],
        ]
      : [[LEAVE, SETTLE]];
    const samples = [];
    let climbed = 0;
    windows.forEach(([a, b]) => {
      let previous = hipAt(a).y;
      for (let f = a; f <= b + 1e-9; f += 0.002) {
        const y = hipAt(f).y;
        climbed += Math.max(0, y - previous);
        previous = y;
        samples.push({ f, climbed, end: b });
      }
    });
    const cycleRise = (PITCH_RISE * (RISE(SETTLE) - RISE(LEAVE))) / (CYCLES - 2);
    const cycles = Math.max(1, Math.round(climbed / cycleRise));
    const n = LIMBS.length;
    const timed = (from, to, i) => {
      const a = lerp(from, to, i / n);
      return { a, b: a + ((to - from) / n) * MOVE_SHARE };
    };
    const slots = [];
    for (let i = 0; i < n; i += 1) slots.push(timed(MOVES_FROM, LEAVE, i));
    const middle = n * cycles;
    let cursor = 0;
    const starts = [];
    for (let j = 0; j < middle; j += 1) {
      const goal = (j / middle) * climbed;
      while (cursor < samples.length - 1 && samples[cursor].climbed < goal) cursor += 1;
      starts.push(samples[cursor]);
    }
    starts.forEach(({ f, end }, j) => {
      const next = j + 1 < middle ? Math.min(starts[j + 1].f, end) : end;
      slots.push({ a: f, b: f + Math.max(0.004, next - f) * MOVE_SHARE });
    });
    for (let i = 0; i < n; i += 1) slots.push(timed(SETTLE, MOVES_TO, i));
    const slotCount = slots.length;

    const moves = { rh: [], lh: [], rf: [], lf: [] };
    const holds = [];
    for (let j = 0; j < slotCount; j += 1) {
      const limb = LIMBS[j % LIMBS.length];
      const { a, b } = slots[j];
      const final = j >= slotCount - LIMBS.length;
      let target;
      if (final) {
        target = to.limbs[limb];
      } else {
        // Centre the hold on the stretch the limb keeps it for (a fall cuts
        // that stretch short).
        let nextGrab = j + LIMBS.length < slotCount ? slots[j + LIMBS.length].b : 1;
        if (info.whipper && b < WHIPPER.fall) nextGrab = Math.min(nextGrab, WHIPPER.fall);
        const mid = (hipAt(b).y + hipAt(nextGrab).y) / 2;
        const rest = REST[limb];
        const y = mid + rest.y + (rand() - 0.5) * 10;
        const x = routeX(mid) + rest.x + (rand() - 0.5) * 16;
        const point = { x, y, z: wallZ(x, y) + 3 };
        const hand = HANDS.has(limb);
        holds.push({
          ...point,
          limb,
          hand,
          progress: index + b,
          size: hand ? 5 + rand() * 4 : 4 + rand() * 3,
          crux: !info.whipper && b > CRUX.from && b < CRUX.to,
        });
        target = fixed(point);
      }
      moves[limb].push({ a, b, target });
    }

    // A whipper: every limb lets go and flails until its first move back.
    if (info.whipper) {
      LIMBS.forEach((limb) => {
        const free = { fixed: false, at: (hip, f, time) => freeLimb(limb, hip, f, time) };
        moves[limb].push({ a: WHIPPER.fall, b: WHIPPER.fall + 0.025, target: free });
        moves[limb].sort((m, n) => m.a - n.a);
      });
    }

    // Bolts between this pitch's anchors (the top one is the anchor itself).
    const bolts = [];
    const boltTop = index + 1 === lastStop ? top - 40 : to.hip.y + HANG.below - BOLT_SPACING * 0.6;
    for (let y = y0 + 70; y < boltTop; y += BOLT_SPACING) {
      const x = routeX(y) + 12;
      bolts.push({ x, y, z: wallZ(x, y) + 1 });
    }

    return { index, ...info, from, to, hipAt, moves, holds, bolts, points: gradePoints(info.grade) };
  }

  const pitchList = Array.from({ length: pitchCount }, (_, i) => buildPitch(i));
  const holds = pitchList.flatMap((pitch) => pitch.holds);
  const bolts = pitchList.flatMap((pitch, i) => pitch.bolts.map((bolt) => ({ ...bolt, pitch: i })));
  const anchors = stances.filter((s) => s.anchor).map((s, i) => ({ ...s.anchor, stop: i + 1 }));

  /* ---------- Poses ---------- */

  /* One limb at pitch progress f: on its last hold, or moving to the next.
   * Height leads depth, so a foot stepping onto the summit clears the edge. */
  function limbAt(pitch, limb, f, hip, time) {
    let position = pitch.from.limbs[limb].at(hip, f, time);
    const list = pitch.moves[limb];
    for (let i = 0; i < list.length; i += 1) {
      const move = list[i];
      if (f < move.a) break;
      const end = move.target.at(hip, f, time);
      if (f < move.b) {
        const t = (f - move.a) / (move.b - move.a);
        const ty = smoothstep(clamp(t * 1.4, 0, 1));
        const tz = smoothstep(clamp((t - 0.25) / 0.75, 0, 1));
        return {
          x: lerp(position.x, end.x, smoothstep(t)),
          y: lerp(position.y, end.y, ty),
          z: lerp(position.z, end.z, tz) + 18 * Math.sin(Math.PI * t),
          moving: true,
        };
      }
      position = end;
    }
    return { ...position, moving: false };
  }

  function stancePose(index) {
    const s = stances[index];
    const limbs = {};
    LIMBS.forEach((limb) => {
      limbs[limb] = { ...s.limbs[limb].at(s.hip, 0, 0), moving: false };
    });
    return {
      hip: { ...s.hip },
      chest: { x: s.hip.x + s.chest.x, y: s.hip.y + TORSO, z: s.hip.z + s.chest.z },
      look: s.kind === "summit" ? 0.6 : s.kind === "hang" ? 0.1 : 0.3,
      limbs,
      pitch: -1,
      phase: s.kind,
      falling: false,
      crux: false,
      stance: s.kind,
      fallDepth: 0,
    };
  }

  /* `time` only animates the flailing during a fall; poses are otherwise a
   * pure function of progress. */
  function poseAt(progress, time = 0) {
    const p = clamp(progress, 0, lastStop);
    const index = Math.min(Math.floor(p), pitchCount - 1);
    const f = p - index;
    if (f === 0) return stancePose(index);
    if (f === 1) return stancePose(lastStop);
    const pitch = pitchList[index];
    const hip = pitch.hipAt(f);
    const limbs = {};
    LIMBS.forEach((limb) => {
      limbs[limb] = limbAt(pitch, limb, f, hip, time);
    });

    // Lean into the wall while climbing, sit back in the stances.
    const startW = 1 - smoothRange(f, 0, LEAVE);
    const endW = smoothRange(f, SETTLE, 1);
    const reachX = (limbs.rh.x + limbs.lh.x) / 2 - hip.x;
    const chestX = lerp(lerp(clamp(reachX * 0.3, -14, 14), pitch.from.chest.x, startW), pitch.to.chest.x, endW);
    const chestZ = lerp(lerp(-8, pitch.from.chest.z, startW), pitch.to.chest.z, endW);

    const falling = pitch.whipper && f > WHIPPER.fall && f < WHIPPER.regrab;
    const crux = !pitch.whipper && f > CRUX.from && f < CRUX.to;
    let phase = "climb";
    if (falling) phase = f < WHIPPER.caught ? "fall" : "hanging";
    else if (f < 0.08) phase = "start";
    else if (f > 0.92) phase = "arrive";

    return {
      hip,
      chest: { x: hip.x + chestX, y: hip.y + TORSO, z: hip.z + chestZ },
      look: falling ? -0.2 : 0.55,
      limbs,
      pitch: index,
      phase,
      falling,
      crux,
      stance: null,
      fallDepth: pitch.whipper ? fallShape(f) : 0,
    };
  }

  /* ---------- Rope ---------- */

  /* The rope runs from the pile at the base through every anchor reached so
   * far, then through the bolts clipped on the current pitch, to the harness.
   * A bolt stays clipped once the hips pass it, even through a fall. */
  function ropeAt(progress, pose) {
    const p = clamp(progress, 0, lastStop);
    const index = Math.min(Math.floor(p), pitchCount - 1);
    const f = p - index;
    const base = stances[0].hip;
    const points = [{ x: base.x + 40, y: 4, z: base.z + 30 }];
    for (let i = 1; i <= index; i += 1) points.push(stances[i].anchor);
    const pitch = pitchList[index];
    const reach =
      pitch.whipper && f > WHIPPER.fall ? Math.max(pitch.hipAt(f).y, pitch.hipAt(WHIPPER.fall).y) : pose.hip.y;
    const clipped = f > 0 ? pitch.bolts.filter((bolt) => bolt.y < reach - 10) : [];
    points.push(...clipped);
    if (p < lastStop) points.push({ x: pose.hip.x, y: pose.hip.y + 4, z: pose.hip.z - 6 });
    return { points, clipped, pitch: index };
  }

  /* ---------- Height ---------- */

  const heightFt = (y) => Math.max(0, Math.round(y * FEET_PER_UNIT));

  /* ---------- Scenery placement ---------- */

  const scenery = [];
  const sceneryRand = seededRandom(1818);
  for (let i = 0; i < 26; i += 1) {
    const x = (sceneryRand() - 0.5) * 1800;
    const z = 80 + sceneryRand() * 700;
    if (Math.abs(x - stances[0].hip.x) < 120 && z < 260) continue;
    scenery.push({ x, z, size: 0.6 + sceneryRand() * 0.8, kind: sceneryRand() < 0.6 ? "sage" : "boulder" });
  }

  return {
    stops,
    stopCount,
    pitchCount,
    top,
    pitches: pitchList,
    stances,
    holds,
    bolts,
    anchors,
    scenery,
    poseAt,
    ropeAt,
    heightFt,
    stanceHipY,
    totalFeet: heightFt(top),
  };
}
