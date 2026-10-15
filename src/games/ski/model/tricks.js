/*
 * Each trick maps air time s (0 at the lip, 1 at touchdown) to a pose. The
 * renderer only knows how to draw pose fields, so new tricks are pure data.
 *   rotation  degrees, around the hips (negative = backflip)
 *   spin      full turns around the vertical axis (drawn as a horizontal flip)
 *   tuck      0..1 knee bend
 *   split     0..1 legs apart (daffy)
 *   cross     0..1 ski tips crossed (iron cross)
 *   grab      0..1 hand to ski
 *   arms      0..1 arms raised
 *   sit       0..1 seated (chairlift); set by the course, not by tricks
 * Rotations must finish on whole turns so every landing is clean.
 */
import { clamp01, smoothRange } from "../../shared/math";

export const REST_POSE = Object.freeze({
  rotation: 0,
  spin: 0,
  tuck: 0,
  split: 0,
  cross: 0,
  grab: 0,
  arms: 0,
  sit: 0,
});

/* 0 -> 1 -> 0: in over the first `edge` of the air, out over the last. */
const hold = (s, edge = 0.18) =>
  Math.min(smoothRange(s, 0.02, edge), 1 - smoothRange(s, 1 - edge, 0.98));

/* 0 -> 1 between start and end; reaches exactly 1 before touchdown. */
const turn = (s, start = 0.1, end = 0.86) => smoothRange(s, start, end);

const trick = (name, points, shape) => ({
  name,
  points,
  pose: (s) => ({ ...REST_POSE, ...shape(clamp01(s)) }),
});

export const TRICKS = [
  trick("Backflip", 500, (s) => ({ rotation: -360 * turn(s), tuck: 0.8 * hold(s) })),
  trick("Three-Sixty", 400, (s) => ({ spin: turn(s), tuck: 0.35 * hold(s), arms: 0.3 * hold(s) })),
  trick("Mute Grab", 350, (s) => ({
    grab: hold(s, 0.25),
    tuck: 0.75 * hold(s, 0.25),
    rotation: -12 * hold(s, 0.3),
  })),
  trick("Front Flip", 550, (s) => ({ rotation: 360 * turn(s), tuck: 0.85 * hold(s) })),
  trick("Daffy", 300, (s) => ({ split: hold(s, 0.25), arms: 0.6 * hold(s, 0.25) })),
  trick("Cork 720", 800, (s) => ({
    rotation: -360 * turn(s),
    spin: 2 * turn(s),
    tuck: 0.6 * hold(s),
  })),
  trick("Iron Cross", 450, (s) => ({
    cross: hold(s, 0.25),
    tuck: 0.4 * hold(s),
    rotation: 10 * hold(s, 0.3),
  })),
  trick("Spread Eagle", 300, (s) => ({ split: 0.7 * hold(s, 0.25), arms: hold(s, 0.25) })),
];

/* The last jump into the finish always gets the biggest trick. */
export const FINALE = trick("Double Backflip", 1200, (s) => ({
  rotation: -720 * turn(s, 0.06, 0.9),
  tuck: 0.95 * hold(s, 0.12),
}));

export function trickForJump(index, jumpCount) {
  return index === jumpCount - 1 ? FINALE : TRICKS[index % TRICKS.length];
}
