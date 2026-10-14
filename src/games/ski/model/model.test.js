import { storyOrder } from "../../../data/story";
import { buildStoryStops } from "../../shared/storyStops";
import { KICKER, LANDING, TOUCHDOWN, createCourse, paceRun } from "./course";
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
  it("has one jump per run and ends on the finale", () => {
    expect(course.jumps).toHaveLength(stops.length - 1);
    expect(course.jumps[course.jumps.length - 1].trick).toBe(FINALE);
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

  it("is downhill from the start gate to the finish", () => {
    for (let i = 1; i < course.stopCount; i += 1) {
      expect(course.groundY(course.stopX(i))).toBeGreaterThan(course.groundY(course.stopX(i - 1)));
    }
    expect(course.elevationAt(course.groundY(0))).toBeCloseTo(11000);
    expect(course.elevationAt(course.groundY(course.finishX))).toBeCloseTo(7760);
  });

  it("parks the skier on the snow, upright, at every stop", () => {
    for (let i = 0; i < course.stopCount; i += 1) {
      const pose = course.poseAt(i);
      expect(pose.airborne).toBe(false);
      expect(pose.x).toBeCloseTo(course.stopX(i));
      expect(pose.y).toBeCloseTo(course.groundY(pose.x));
      expect(pose.pose.rotation).toBe(0);
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

  it("goes airborne exactly between the lip and the landing", () => {
    const lipF = 0.28;
    expect(course.poseAt(lipF - 0.01).airborne).toBe(false);
    expect(course.poseAt(lipF + 0.01).airborne).toBe(true);
    expect(course.poseAt(TOUCHDOWN - 0.01).airborne).toBe(true);
    expect(course.poseAt(TOUCHDOWN + 0.01).airborne).toBe(false);
    expect(course.kickerBump((KICKER.lip) * course.runLength)).toBeCloseTo(KICKER.height);
  });

  it("covers every distinct trick before repeating", () => {
    const names = course.jumps.slice(0, -1).map((jump) => jump.trick.name);
    expect(new Set(names.slice(0, TRICKS.length)).size).toBe(Math.min(names.length, TRICKS.length));
  });
});

describe("SkiModel", () => {
  it("skis to a checkpoint without overshooting and shows its card", () => {
    const model = new SkiModel(course);
    model.setTarget(1);
    let maxSeen = 0;
    for (let t = 0; t < 10; t += 1 / 60) {
      model.step(1 / 60);
      maxSeen = Math.max(maxSeen, model.progress);
    }
    expect(maxSeen).toBeLessThanOrEqual(1);
    expect(model.progress).toBe(1);
    const snapshot = model.getSnapshot();
    expect(snapshot.activeStop).toBe(1);
    expect(snapshot.score).toBe(course.jumps[0].trick.points);
    expect(snapshot.landedCount).toBe(1);
  });

  it("takes a couple of seconds per run so the trick is visible", () => {
    const model = new SkiModel(course);
    model.setTarget(1);
    const seconds = runUntilSettled(model);
    expect(seconds).toBeGreaterThan(1.5);
    expect(seconds).toBeLessThan(4);
  });

  it("reports the trick while airborne and the points on landing", () => {
    const model = new SkiModel(course);
    model.setTarget(1);
    let sawTrick = false;
    let sawLanding = false;
    for (let t = 0; t < 6; t += 1 / 60) {
      model.step(1 / 60);
      const snapshot = model.getSnapshot();
      if (snapshot.trick === 0) sawTrick = true;
      if (snapshot.landed === 0) sawLanding = true;
      if (snapshot.activeStop === 0 && model.progress > 0.5) throw new Error("card shown mid-run");
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
