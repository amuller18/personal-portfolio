/*
 * Composition root for climb mode, a fork of ski mode: build the route from
 * the story, then hand it to a view (canvas + overlay) and the shared scroll
 * controller.
 *
 *   model       model/route.js, model/ClimbModel.js
 *   view        view/three/* (3D, default) or view/ClimbRenderer2D.js (?view=2d
 *               or when WebGL is unavailable), view/ClimbOverlay.jsx
 *   controller  ../shared/ScrollStoryController.js
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePrefersReducedMotion } from "../../hooks/useInView";
import ScrollStoryController from "../shared/ScrollStoryController";
import { buildStoryStops } from "../shared/storyStops";
import ClimbModel from "./model/ClimbModel";
import { createRoute } from "./model/route";
import ClimbOverlay from "./view/ClimbOverlay";
import ClimbRenderer2D from "./view/ClimbRenderer2D";
import ClimbRenderer3D from "./view/three/ClimbRenderer3D";
import "./view/climb.css";

/* Views are interchangeable: both read the same model frames. */
function createRenderer(canvas, route) {
  const wants2d = new URLSearchParams(window.location.search).get("view") === "2d";
  if (!wants2d) {
    try {
      return new ClimbRenderer3D(canvas, route);
    } catch (error) {
      // No WebGL context was created, so the same canvas can still go 2D.
      return new ClimbRenderer2D(canvas, route);
    }
  }
  return new ClimbRenderer2D(canvas, route);
}

function createGame() {
  const route = createRoute(buildStoryStops());
  const model = new ClimbModel(route);
  const controller = new ScrollStoryController(model);
  return { route, controller };
}

export default function ClimbGame() {
  const [{ route, controller }] = useState(createGame);
  const trackRef = useRef(null);
  const canvasRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    const root = document.documentElement;
    const previousTitle = document.title;
    root.classList.add("climb-mode");
    document.title = "Alex Muller · Climb the story";
    const renderer = createRenderer(canvasRef.current, route);
    controller.attach({ track: trackRef.current, renderer });
    return () => {
      controller.detach();
      root.classList.remove("climb-mode");
      document.title = previousTitle;
    };
  }, [controller, route]);

  useEffect(() => {
    controller.setReducedMotion(reducedMotion);
  }, [controller, reducedMotion]);

  return (
    <div className="climb" ref={trackRef}>
      <div className="climb__stage">
        <canvas ref={canvasRef} className="climb__canvas" aria-hidden="true" />
        <ClimbOverlay snapshot={snapshot} route={route} controller={controller} />
      </div>
    </div>
  );
}
