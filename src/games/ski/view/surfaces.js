/*
 * Chapters whose content is shown on an object in the 3D world instead of a
 * floating card. Keyed by chapter id; add a chapter here (plus a component in
 * SurfaceContent.jsx and a builder in world3d.js) to give it its own set piece.
 */
import { clamp } from "../../shared/math";

export const SURFACES = {
  hustle: "station",
  telaviv: "trailMap",
  offline: "treeSign",
  tutormatch: "rock",
  traderranker: "jumbotron",
  wolfe: "menu",
};

/*
 * Per board: its height in world units, and a fixed aspect if it has one;
 * otherwise the board takes the viewport's shape so it can fill the screen.
 * `expand` boards grow from a small sign.
 */
export const SURFACE_SPECS = {
  station: { height: 300 },
  trailMap: { height: 300 },
  treeSign: { height: 300, expand: true },
  rock: { height: 300 },
  jumbotron: { height: 300 },
  menu: { height: 170 },
};

/* Content is laid out at a fixed pixel height and scaled into the world. */
export const SURFACE_PX_HEIGHT = 1000;
export const SURFACE_WORLD_HEIGHT = 300;
export const SURFACE_MIN_ASPECT = 0.56;
export const SURFACE_MAX_ASPECT = 1.9;
export const SURFACE_MAX_WIDTH = SURFACE_WORLD_HEIGHT * SURFACE_MAX_ASPECT;

/* Boards match the viewport's shape so they can fill the screen. */
export function surfaceAspect(width, height, kind) {
  const spec = SURFACE_SPECS[kind];
  if (spec && spec.aspect) return spec.aspect;
  return clamp(width / Math.max(1, height), SURFACE_MIN_ASPECT, SURFACE_MAX_ASPECT);
}

export function surfaceKindFor(stop) {
  return stop && stop.kind === "chapter" ? SURFACES[stop.id] || null : null;
}
