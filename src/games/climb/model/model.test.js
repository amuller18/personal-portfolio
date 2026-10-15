import { storyOrder } from "../../../data/story";
import { buildStoryStops } from "../../shared/storyStops";
import { solveBody } from "../view/rig";
import { solveLimb } from "../view/ik";
import ClimbModel from "./ClimbModel";
import {
  ARM,
  CRUX,
  HIP_HALF,
  LEG,
  LIMBS,
  PITCH_RISE,
  SENT,
  SHOULDER_HALF,
  STAND_HIP,
  WHIPPER,
  createRoute,
  gradePoints,
  wallZ,
} from "./route";

const stops = buildStoryStops();
const route = createRoute(stops);
const lastStop = route.stopCount - 1;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function samples(step = 0.002) {
  const list = [];
  for (let p = 0; p < lastStop; p += step) list.push(p);
  list.push(lastStop);
  return list;
}

function runUntilSettled(model, maxSeconds = 60) {
  for (let t = 0; t < maxSeconds; t += 1 / 60) {
    model.step(1 / 60);
    if (model.progress === model.target && model.velocity === 0) return t;
  }
  throw new Error("model never settled");
}

describe("route", () => {
  it("has one pitch per chapter plus the summit push", () => {
    expect(route.stopCount).toBe(storyOrder.length + 2);
    expect(route.pitches).toHaveLength(storyOrder.length + 1);
    expect(route.pitches.map((pitch) => pitch.name)[0]).toBe("Hustle Crack");
    expect(route.pitches.filter((pitch) => pitch.whipper)).toHaveLength(1);
    expect(route.top).toBe(route.pitches.length * PITCH_RISE);
    expect(route.totalFeet).toBe(900);
  });

  it("names a pitch after its chapter, with a fallback for new chapters", () => {
    const extra = createRoute([...stops.slice(0, -1), { ...stops[1], id: "brand-new" }, stops[stops.length - 1]]);
    const added = extra.pitches[extra.pitches.length - 2];
    expect(added.name).toMatch(/^Pitch \d+$/);
    expect(added.grade).toMatch(/^5\.\d+[a-d]?$/);
  });

  it("scores harder grades higher", () => {
    expect(gradePoints("5.7")).toBeLessThan(gradePoints("5.9"));
    expect(gradePoints("5.10a")).toBeLessThan(gradePoints("5.10c"));
    expect(gradePoints("5.10d")).toBeLessThan(gradePoints("5.11a"));
    expect(gradePoints("V4")).toBe(100);
  });

  it("starts on the ground, hangs at every chapter anchor and stands on the summit", () => {
    expect(route.poseAt(0).stance).toBe("ground");
    expect(route.poseAt(0).hip.y).toBe(STAND_HIP);
    for (let i = 1; i < lastStop; i += 1) {
      const pose = route.poseAt(i);
      expect(pose.stance).toBe("hang");
      expect(pose.hip.y).toBe(route.stanceHipY(i));
    }
    const summit = route.poseAt(lastStop);
    expect(summit.stance).toBe("summit");
    expect(summit.hip.y).toBeGreaterThan(route.top);
    // Arms up on top.
    expect(summit.limbs.rh.y).toBeGreaterThan(summit.chest.y);
    expect(summit.limbs.lh.y).toBeGreaterThan(summit.chest.y);
  });

  it("moves continuously, including across anchors and through the whipper", () => {
    const h = 1e-6;
    samples(0.0005).forEach((p) => {
      if (p + h > lastStop) return;
      const a = route.poseAt(p, 1);
      const b = route.poseAt(p + h, 1);
      expect(distance(a.hip, b.hip)).toBeLessThan(0.05);
      LIMBS.forEach((limb) => expect(distance(a.limbs[limb], b.limbs[limb])).toBeLessThan(0.05));
    });
  });

  it("never asks a limb to reach further than it can", () => {
    samples().forEach((p) => {
      const pose = route.poseAt(p, 0);
      ["rh", "lh"].forEach((limb) => {
        const side = limb[0] === "r" ? 1 : -1;
        const shoulder = { ...pose.chest, x: pose.chest.x + side * SHOULDER_HALF };
        expect(distance(pose.limbs[limb], shoulder)).toBeLessThanOrEqual(ARM[0] + ARM[1]);
      });
      ["rf", "lf"].forEach((limb) => {
        const side = limb[0] === "r" ? 1 : -1;
        const hip = { ...pose.hip, x: pose.hip.x + side * HIP_HALF };
        expect(distance(pose.limbs[limb], hip)).toBeLessThanOrEqual(LEG[0] + LEG[1]);
      });
    });
  });

  it("keeps the body off the rock", () => {
    // Only below the summit lip: on top, the body is meant to be past the face.
    const below = samples()
      .map((p) => route.poseAt(p, 0))
      .filter(({ chest }) => chest.y < route.top);
    expect(below.length).toBeGreaterThan(1000);
    below.forEach(({ hip, chest }) => {
      expect(hip.z - wallZ(hip.x, hip.y)).toBeGreaterThan(14);
      expect(chest.z - wallZ(chest.x, chest.y)).toBeGreaterThan(10);
    });
  });

  it("puts every hold on the face, and every grab on a hold", () => {
    route.holds.forEach((hold) => {
      expect(Math.abs(hold.z - wallZ(hold.x, hold.y) - 3)).toBeLessThan(1e-9);
    });
    // Mid-pitch, a limb that isn't moving is on a hold.
    const pose = route.poseAt(1.5, 0);
    LIMBS.filter((limb) => !pose.limbs[limb].moving).forEach((limb) => {
      const nearest = Math.min(...route.holds.map((hold) => distance(hold, pose.limbs[limb])));
      expect(nearest).toBeLessThan(1e-6);
    });
  });

  it("falls, swings on the rope and climbs back on the whipper pitch", () => {
    const pitch = route.pitches.find((p) => p.whipper);
    const before = route.poseAt(pitch.index + WHIPPER.fall, 0);
    const caught = route.poseAt(pitch.index + WHIPPER.settle + 0.01, 0);
    expect(caught.falling).toBe(true);
    expect(caught.phase).toBe("hanging");
    expect(before.hip.y - caught.hip.y).toBeCloseTo(WHIPPER.drop, 6);
    // Hanging on the rope goes nowhere until the regrab.
    const later = route.poseAt(pitch.index + WHIPPER.regrab - 0.005, 0);
    expect(later.hip.y).toBeCloseTo(caught.hip.y, 6);
    expect(route.poseAt(pitch.index + 0.95, 0).falling).toBe(false);
    // The rope runs up to the highest clipped bolt, above the climber.
    const rope = route.ropeAt(pitch.index + WHIPPER.settle + 0.01, caught);
    const top = Math.max(...rope.clipped.map((bolt) => bolt.y));
    expect(top).toBeGreaterThan(caught.hip.y);
  });

  it("marks a crux on every other pitch", () => {
    route.pitches
      .filter((pitch) => !pitch.whipper)
      .forEach((pitch) => {
        expect(route.poseAt(pitch.index + (CRUX.from + CRUX.to) / 2, 0).crux).toBe(true);
        expect(route.poseAt(pitch.index + 0.3, 0).crux).toBe(false);
      });
  });

  it("threads the rope through every anchor reached and ends at the harness", () => {
    const pose = route.poseAt(3.5);
    const { points } = route.ropeAt(3.5, pose);
    expect(points[0].y).toBeLessThan(10);
    [1, 2, 3].forEach((stop) => expect(points).toContain(route.stances[stop].anchor));
    expect(points[points.length - 1].y).toBeCloseTo(pose.hip.y + 4);
    expect(route.ropeAt(lastStop, route.poseAt(lastStop)).points.length).toBeGreaterThan(lastStop);
  });
});

describe("rig", () => {
  it("solves reachable targets exactly and clamps unreachable ones", () => {
    const root = { x: 0, y: 0, z: 0 };
    const near = solveLimb(root, { x: 30, y: 40, z: 0 }, 40, 38, { x: 0, y: 0, z: 1 });
    expect(distance(near.end, { x: 30, y: 40, z: 0 })).toBeLessThan(1e-9);
    expect(distance(near.joint, root)).toBeCloseTo(40);
    expect(distance(near.joint, near.end)).toBeCloseTo(38);
    expect(near.joint.z).toBeGreaterThan(0);
    const far = solveLimb(root, { x: 0, y: 500, z: 0 }, 40, 38, { x: 1, y: 0, z: 0 });
    expect(far.end.y).toBeLessThan(78);
  });

  it("keeps every bone at its length through the whole climb", () => {
    samples(0.01).forEach((p) => {
      const body = solveBody(route.poseAt(p, 0));
      Object.entries(body.limbs).forEach(([key, limb]) => {
        const [upper, lower] = key[1] === "h" ? ARM : LEG;
        expect(distance(limb.root, limb.joint)).toBeCloseTo(upper, 3);
        expect(distance(limb.joint, limb.end)).toBeCloseTo(lower, 3);
      });
    });
  });
});

describe("ClimbModel", () => {
  it("climbs to the next anchor and shows its card", () => {
    const model = new ClimbModel(route);
    expect(model.getSnapshot().activeStop).toBe(0);
    model.setTarget(1);
    for (let i = 0; i < 30; i += 1) model.step(1 / 60);
    expect(model.getSnapshot().activeStop).toBe(-1);
    const seconds = runUntilSettled(model);
    expect(seconds).toBeGreaterThan(1);
    expect(seconds).toBeLessThan(6);
    const snapshot = model.getSnapshot();
    expect(snapshot.activeStop).toBe(1);
    expect(snapshot.pitch).toBe(0);
    expect(snapshot.sentCount).toBe(1);
    expect(snapshot.score).toBe(route.pitches[0].points);
    expect(snapshot.height).toBe(100);
  });

  it("calls out the crux, the whipper and the send on the way up", () => {
    const model = new ClimbModel(route);
    const whipper = route.pitches.find((p) => p.whipper).index;
    model.teleport(whipper);
    model.setTarget(whipper + 1);
    const seen = { crux: false, fall: false, sent: false };
    for (let t = 0; t < 20 && model.progress < model.target; t += 1 / 60) {
      model.step(1 / 60);
      const s = model.getSnapshot();
      seen.crux = seen.crux || s.crux;
      seen.fall = seen.fall || s.fall;
      seen.sent = seen.sent || s.sent === whipper;
    }
    expect(seen).toEqual({ crux: false, fall: true, sent: true });

    model.teleport(0);
    model.setTarget(1);
    let crux = false;
    for (let t = 0; t < 20 && model.progress < model.target; t += 1 / 60) {
      model.step(1 / 60);
      crux = crux || model.getSnapshot().crux;
    }
    expect(crux).toBe(true);
  });

  it("tops out with every pitch sent, onsight unless it downclimbed", () => {
    const model = new ClimbModel(route);
    model.setTarget(lastStop);
    runUntilSettled(model);
    let snapshot = model.getSnapshot();
    expect(snapshot.activeStop).toBe(lastStop);
    expect(snapshot.sentCount).toBe(route.pitches.length);
    expect(snapshot.score).toBe(route.pitches.reduce((sum, pitch) => sum + pitch.points, 0));
    expect(snapshot.height).toBe(900);
    expect(snapshot.downclimbed).toBe(false);

    model.setTarget(lastStop - 1);
    runUntilSettled(model);
    snapshot = model.getSnapshot();
    expect(snapshot.downclimbed).toBe(true);
    // Sends are kept on the way back down.
    expect(snapshot.sentCount).toBe(route.pitches.length);

    model.teleport(0);
    expect(model.getSnapshot().score).toBe(0);
    expect(model.getSnapshot().downclimbed).toBe(false);
  });

  it("jumps straight to the target with reduced motion", () => {
    const model = new ClimbModel(route);
    model.reducedMotion = true;
    model.setTarget(4);
    model.step(1 / 60);
    expect(model.progress).toBe(4);
    expect(model.getSnapshot().activeStop).toBe(4);
  });

  it("counts a pitch as sent only near its anchor", () => {
    const model = new ClimbModel(route);
    model.reducedMotion = true;
    model.setTarget(SENT - 0.05);
    model.step(1 / 60);
    expect(model.getSnapshot().sentCount).toBe(0);
    model.setTarget(SENT + 0.01);
    model.step(1 / 60);
    expect(model.getSnapshot().sentCount).toBe(1);
  });
});
