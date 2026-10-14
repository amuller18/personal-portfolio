/*
 * Composition root for ski mode: build the model from the story, then hand it
 * to a view (canvas + overlay) and the shared scroll controller.
 *
 *   model       model/course.js, model/tricks.js, model/SkiModel.js
 *   view        view/SkiRenderer.js, view/drawSkier.js, view/SkiOverlay.jsx
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
import "./view/ski.css";

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
  const reducedMotion = usePrefersReducedMotion();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    const root = document.documentElement;
    const previousTitle = document.title;
    root.classList.add("ski-mode");
    document.title = "Alex Muller · Ski the story";
    const renderer = new SkiRenderer(canvasRef.current, course);
    controller.attach({ track: trackRef.current, renderer });
    return () => {
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
        <SkiOverlay snapshot={snapshot} course={course} controller={controller} />
      </div>
    </div>
  );
}
