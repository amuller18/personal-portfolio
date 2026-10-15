/*
 * Composition root for ski mode: build the model from the story, then hand it
 * to a view (canvas + overlay) and the shared scroll controller.
 *
 *   model       model/course.js, model/tricks.js, model/SkiModel.js
 *   view        view/three/* (3D, default) or view/SkiRenderer.js (2D pixel
 *               art, ?view=2d or when WebGL is unavailable), view/SkiOverlay.jsx
 *   controller  ../shared/ScrollStoryController.js
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePrefersReducedMotion } from "../../hooks/useInView";
import ScrollStoryController from "../shared/ScrollStoryController";
import { buildStoryStops } from "../shared/storyStops";
import { createCourse } from "./model/course";
import SkiModel from "./model/SkiModel";
import SkiOverlay from "./view/SkiOverlay";
import SkiRenderer from "./view/SkiRenderer";
import SkiRenderer3D from "./view/three/SkiRenderer3D";
import "./view/ski.css";

/* Views are interchangeable: both read the same model frames. */
function createRenderer(canvas, course, surfaceLayer) {
  const wants2d = new URLSearchParams(window.location.search).get("view") === "2d";
  if (!wants2d) {
    try {
      return new SkiRenderer3D(canvas, course, { surfaceLayer });
    } catch (error) {
      // No WebGL context was created, so the same canvas can still go 2D.
      return new SkiRenderer(canvas, course);
    }
  }
  return new SkiRenderer(canvas, course);
}

function createGame() {
  const course = createCourse(buildStoryStops());
  const model = new SkiModel(course);
  const controller = new ScrollStoryController(model);
  return { course, controller };
}

export default function SkiGame() {
  const [{ course, controller }] = useState(createGame);
  const trackRef = useRef(null);
  const canvasRef = useRef(null);
  const surfaceLayerRef = useRef(null);
  const [surfaceMounts, setSurfaceMounts] = useState({});
  const reducedMotion = usePrefersReducedMotion();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    const root = document.documentElement;
    const previousTitle = document.title;
    root.classList.add("ski-mode");
    document.title = "Alex Muller · Ski the story";
    const renderer = createRenderer(canvasRef.current, course, surfaceLayerRef.current);
    setSurfaceMounts({ ...(renderer.surfaceMounts || {}) });
    controller.attach({ track: trackRef.current, renderer });
    return () => {
      setSurfaceMounts({});
      controller.detach();
      root.classList.remove("ski-mode");
      document.title = previousTitle;
    };
  }, [controller, course]);

  useEffect(() => {
    controller.setReducedMotion(reducedMotion);
  }, [controller, reducedMotion]);

  return (
    <div className="ski" ref={trackRef}>
      <div className="ski__stage">
        <canvas ref={canvasRef} className="ski__canvas" aria-hidden="true" />
        <div ref={surfaceLayerRef} className="ski__surfaces" />
        <SkiOverlay snapshot={snapshot} course={course} controller={controller} surfaceMounts={surfaceMounts} />
      </div>
    </div>
  );
}
