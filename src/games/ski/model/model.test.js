import { storyOrder } from "../../../data/story";
import { buildStoryStops } from "../../shared/storyStops";
import { KICKER, LANDING, LIFT, LODGE, TOUCHDOWN, createCourse, paceRun } from "./course";
import SkiModel from "./SkiModel";
import { FINALE, TRICKS } from "./tricks";

const stops = buildStoryStops();
const course = createCourse(stops);

function runUntilSettled(model, maxSeconds = 60) {
  for (let t = 0; t < maxSeconds; t += 1 / 60) {
    model.step(1 / 60);
    if (model.progress === model.target && model.velocity === 0) return t;
  }
  throw new Error("model never settled");
}

describe("story stops", () => {
  it("wraps every chapter with a start and a finish", () => {
    expect(stops).toHaveLength(storyOrder.length + 2);
    expect(stops[0].kind).toBe("start");
    expect(stops[stops.length - 1].kind).toBe("finish");
    stops.slice(1, -1).forEach((stop, i) => {
      expect(stop.id).toBe(storyOrder[i].id);
      expect(typeof stop.summary).toBe("string");
      expect(stop.summary.length).toBeGreaterThan(0);
    });
  });
});

describe("course", () => {
  it("has one jump per descent, a chairlift up to the trail map, and ends on the finale", () => {
    const kickers = course.runs.filter((run) => run.type === "descent" || run.type === "lodge");
    expect(course.jumps).toHaveLength(kickers.length);
    expect(course.runs.map((run) => run.type)).toEqual([
      "walk",
      "lift",
      "glade",
      "cliff",
      "descent",
      "lodge",
      "descent",
      "descent",
      "descent",
    ]);
    expect(course.jumps[0].trick.name).toBe("Three-Sixty");
    expect(course.jumps[course.jumps.length - 1].trick).toBe(FINALE);
    const liftRun = course.runs.find((run) => run.type === "lift");
    expect(stops[liftRun.index + 1].id).toBe("telaviv");
    expect(course.lifts).toHaveLength(1);
    expect(course.runs[0].type).toBe("walk");
    expect(stops[1].id).toBe("hustle");
  });

  it("starts with skis on the shoulder and ends the walk with them on", () => {
    const intro = course.poseAt(0);
    expect(intro.pose.carry).toBe(1);
    expect(course.poseAt(1).pose.carry).toBe(0);
    const phases = [];
    for (let p = 0; p < 1; p += 0.01) {
      const { phase } = course.poseAt(p);
      if (phases[phases.length - 1] !== phase) phases.push(phase);
    }
    expect(phases).toEqual(["walk", "stepin", "shuffle"]);
  });

  it("paces runs monotonically from 0 to 1", () => {
    let previous = -1;
    for (let f = 0; f <= 1.0001; f += 0.01) {
      const u = paceRun(f);
      expect(u).toBeGreaterThanOrEqual(previous);
      previous = u;
    }
    expect(paceRun(0)).toBe(0);
    expect(paceRun(1)).toBe(1);
    expect(paceRun(TOUCHDOWN)).toBeCloseTo(LANDING);
  });

  it("climbs on lift runs, drops on descents, and ends at the base", () => {
    course.runs.forEach((run) => {
      const drop = course.groundY(run.end) - course.groundY(run.start);
      if (run.type === "lift") expect(drop).toBeLessThan(-300);
      else if (run.type === "walk") expect(Math.abs(drop)).toBeLessThan(1);
      else expect(drop).toBeGreaterThan(300);
    });
    const top = Math.min(...stops.map((_, i) => course.groundY(course.stopX(i))));
    expect(course.elevationAt(top)).toBeCloseTo(11000);
    expect(course.elevationAt(course.groundY(course.finishX))).toBeCloseTo(7760);
  });

  it("parks the skier on the snow, upright, at every stop", () => {
    for (let i = 0; i < course.stopCount; i += 1) {
      const pose = course.poseAt(i);
      expect(pose.airborne).toBe(false);
      expect(pose.x).toBeCloseTo(course.stopX(i));
      expect(pose.y).toBeCloseTo(course.groundY(pose.x));
      expect(Math.abs(pose.pose.rotation % 360)).toBe(0);
    }
  });

  it("keeps every jump above the snow and lands every trick on whole turns", () => {
    course.jumps.forEach((jump) => {
      for (let p = jump.index; p <= jump.index + 1; p += 0.002) {
        const pose = course.poseAt(p);
        if (!pose.airborne) continue;
        expect(pose.y).toBeLessThanOrEqual(course.groundY(pose.x) + 0.5);
      }
      const end = jump.trick.pose(1);
      expect(Math.abs(end.rotation % 360)).toBeLessThan(1e-6);
      expect(Math.abs(Math.cos(end.spin * Math.PI * 2) - 1)).toBeLessThan(1e-6);
      ["tuck", "split", "cross", "grab", "arms"].forEach((key) => expect(end[key]).toBeCloseTo(0, 5));
    });
  });

  it("keeps the rider seated and clear of the snow for the whole chairlift ride", () => {
    const run = course.runs.find((r) => r.type === "lift");
    for (let f = LIFT.load; f < LIFT.ride; f += 0.004) {
      const pose = course.poseAt(run.index + f);
      expect(pose.phase).toBe("lift");
      expect(pose.pose.sit).toBe(1);
      expect(pose.lift).not.toBeNull();
      expect(course.groundY(pose.x) - pose.y).toBeGreaterThanOrEqual(-0.5);
    }
    const mid = course.poseAt(run.index + (LIFT.load + LIFT.ride) / 2);
    expect(course.groundY(mid.x) - mid.y).toBeGreaterThan(80);
  });

  it("moves continuously through every phase change", () => {
    let previous = course.poseAt(0);
    for (let p = 0.0005; p <= course.stopCount - 1; p += 0.0005) {
      const pose = course.poseAt(p);
      expect(Math.hypot(pose.x - previous.x, pose.y - previous.y)).toBeLessThan(12);
      previous = pose;
    }
  });

  it("goes airborne exactly between the lip and the landing", () => {
    course.jumps.forEach((jump) => {
      expect(course.poseAt(jump.run + jump.takeoff - 0.01).airborne).toBe(false);
      expect(course.poseAt(jump.run + jump.takeoff + 0.01).airborne).toBe(true);
      expect(course.poseAt(jump.run + jump.touchdown - 0.01).airborne).toBe(true);
      expect(course.poseAt(jump.run + jump.touchdown + 0.01).airborne).toBe(false);
    });
    expect(course.kickerBump(course.jumps[0].lipX)).toBeCloseTo(KICKER.height);
  });

  it("weaves through the glade and arrives back on the line at the sign", () => {
    const glade = course.runs.find((run) => run.type === "glade");
    let widest = 0;
    for (let f = 0; f <= 1; f += 0.01) widest = Math.max(widest, Math.abs(course.poseAt(glade.index + f).z));
    expect(widest).toBeGreaterThan(60);
    expect(course.poseAt(glade.index + 1).z).toBeCloseTo(0);
  });

  it("drops the cliff, tumbles, and stops sprawled with a ski missing", () => {
    const cliff = course.runs.find((run) => run.type === "cliff");
    const phases = [];
    for (let f = 0; f <= 1; f += 0.01) {
      const { phase } = course.poseAt(cliff.index + f);
      if (phases[phases.length - 1] !== phase) phases.push(phase);
    }
    expect(phases).toEqual(["cliff-approach", "cliff-air", "tumble", "rest"]);
    const rest = course.poseAt(cliff.index + 1);
    expect(rest.pose.sprawl).toBe(1);
    expect(rest.pose.lostSki).toBe(1);
    expect(course.groundY(cliff.cliff.lipX + 80) - course.groundY(cliff.cliff.lipX)).toBeGreaterThan(200);
    // Getting up on the next run brings the ski back.
    const after = course.poseAt(cliff.index + 1.2);
    expect(after.pose.sprawl).toBe(0);
    expect(after.pose.lostSki).toBe(0);
  });

  it("walks into the lodge with skis off, and back out to click in", () => {
    const lodge = course.runs.find((run) => run.type === "lodge");
    const inside = course.poseAt(lodge.index + 1);
    expect(inside.z).toBeCloseTo(LODGE.insideZ);
    expect(inside.pose.noSkis).toBe(1);
    const back = course.poseAt(lodge.index + 1.3);
    expect(back.z).toBeCloseTo(0);
    expect(back.pose.noSkis).toBe(0);
  });

  it("covers every distinct trick before repeating", () => {
    const names = course.jumps.slice(0, -1).map((jump) => jump.trick.name);
    expect(new Set(names.slice(0, TRICKS.length)).size).toBe(Math.min(names.length, TRICKS.length));
  });
});

describe("SkiModel", () => {
  const firstDescent = course.jumps[0].run;

  it("skis to a checkpoint without overshooting and shows its card", () => {
    const model = new SkiModel(course);
    model.teleport(firstDescent);
    model.setTarget(firstDescent + 1);
    let maxSeen = 0;
    for (let t = 0; t < 10; t += 1 / 60) {
      model.step(1 / 60);
      maxSeen = Math.max(maxSeen, model.progress);
    }
    expect(maxSeen).toBeLessThanOrEqual(firstDescent + 1);
    expect(model.progress).toBe(firstDescent + 1);
    const snapshot = model.getSnapshot();
    expect(snapshot.activeStop).toBe(firstDescent + 1);
    expect(snapshot.score).toBe(course.jumps[0].trick.points);
    expect(snapshot.landedCount).toBe(1);
  });

  it("takes a couple of seconds per run so the trick is visible", () => {
    const model = new SkiModel(course);
    model.teleport(firstDescent);
    model.setTarget(firstDescent + 1);
    const seconds = runUntilSettled(model);
    expect(seconds).toBeGreaterThan(1.5);
    expect(seconds).toBeLessThan(4);
  });

  it("rides the chairlift slower than a ski run", () => {
    const model = new SkiModel(course);
    model.teleport(1);
    model.setTarget(2);
    const seconds = runUntilSettled(model);
    expect(seconds).toBeGreaterThan(4);
    expect(seconds).toBeLessThan(10);
    expect(model.getSnapshot().activeStop).toBe(2);
  });

  it("reports the trick while airborne and the points on landing", () => {
    const model = new SkiModel(course);
    model.teleport(firstDescent);
    model.setTarget(firstDescent + 1);
    let sawTrick = false;
    let sawLanding = false;
    for (let t = 0; t < 6; t += 1 / 60) {
      model.step(1 / 60);
      const snapshot = model.getSnapshot();
      if (snapshot.trick === 0) sawTrick = true;
      if (snapshot.landed === 0) sawLanding = true;
      if (snapshot.activeStop === firstDescent && model.progress > firstDescent + 0.5) throw new Error("card shown mid-run");
    }
    expect(sawTrick).toBe(true);
    expect(sawLanding).toBe(true);
  });

  it("catches up quickly on long scrolls and keeps the best score when rewinding", () => {
    const model = new SkiModel(course);
    const last = course.stopCount - 1;
    model.setTarget(last);
    expect(runUntilSettled(model)).toBeLessThan(15);
    const full = course.jumps.reduce((total, jump) => total + jump.trick.points, 0);
    expect(model.getSnapshot().score).toBe(full);

    model.setTarget(2);
    model.step(1 / 60);
    model.step(1 / 60);
    expect(model.getSnapshot().rewinding).toBe(true);
    runUntilSettled(model);
    expect(model.getSnapshot().score).toBe(full);

    model.teleport(0);
    expect(model.getSnapshot().score).toBe(0);
  });

  it("jumps straight to the target with reduced motion", () => {
    const model = new SkiModel(course);
    model.reducedMotion = true;
    model.setTarget(3);
    model.step(1 / 60);
    expect(model.progress).toBe(3);
    expect(model.getSnapshot().activeStop).toBe(3);
  });

  it("clamps targets to the course", () => {
    const model = new SkiModel(course);
    model.setTarget(-5);
    expect(model.target).toBe(0);
    model.setTarget(999);
    expect(model.target).toBe(course.stopCount - 1);
  });
});
