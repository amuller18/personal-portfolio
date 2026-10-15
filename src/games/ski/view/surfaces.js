/*
 * Chapters whose content is shown on an object in the 3D world instead of a
 * floating card. Keyed by chapter id; add a chapter here (plus a component in
 * SurfaceContent.jsx and a prop in world3d.js) to give it its own set piece.
 */
import { clamp } from "../../shared/math";

export const SURFACES = {
  hustle: "station",
  telaviv: "trailMap",
};

/* Content is laid out at a fixed pixel height and scaled into the world. */
export const SURFACE_PX_HEIGHT = 1000;
export const SURFACE_WORLD_HEIGHT = 300;
export const SURFACE_MIN_ASPECT = 0.56;
export const SURFACE_MAX_ASPECT = 1.9;
export const SURFACE_MAX_WIDTH = SURFACE_WORLD_HEIGHT * SURFACE_MAX_ASPECT;

/* Boards match the viewport's shape so they can fill the screen. */
export function surfaceAspect(width, height) {
  return clamp(width / Math.max(1, height), SURFACE_MIN_ASPECT, SURFACE_MAX_ASPECT);
}

export function surfaceKindFor(stop) {
  return stop && stop.kind === "chapter" ? SURFACES[stop.id] || null : null;
}
