/*
 * Controller shared by every game mode. It owns input and time, nothing else:
 *   - page scroll maps to a continuous progress value (1 viewport-ish per stop)
 *   - buttons and keys scroll to a stop, so scroll and buttons never disagree
 *   - a short idle after scrolling snaps to the nearest stop in that direction
 *   - one requestAnimationFrame loop steps the model and draws the renderer
 *
 * A model needs: stopCount, target, setTarget(p), teleport(p), step(dt),
 * frame, getSnapshot() (with a `phaseKey` string for discrete changes) and
 * reducedMotion. A renderer needs: resize(), render(frame, dt), reducedMotion.
 */
import { clamp, shallowEqual } from "./math";

const SNAP_DELAY_MS = 170;
const PENDING_TIMEOUT_MS = 1400;
const NUMERIC_EMIT_MS = 100;
const EPSILON = 1e-3;

export default class ScrollStoryController {
  constructor(model, { stepViewports = 1.1 } = {}) {
    this.model = model;
    this.stepViewports = stepViewports;
    this.listeners = new Set();
    this.snapshot = model.getSnapshot();
    this.renderer = null;
    this.track = null;
    this.stepPx = 1;
    this.trackTop = 0;
    this.direction = 0;
    this.lastScroll = 0;
    this.touching = false;
    this.pending = null;
    this.pendingTimer = 0;
    this.snapTimer = 0;
    this.frameId = 0;
    this.lastTime = 0;
    this.lastEmit = 0;
    this.reducedMotion = false;
  }

  /* ---------- Store (useSyncExternalStore) ---------- */

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  publish(now) {
    const next = this.model.getSnapshot();
    if (shallowEqual(next, this.snapshot)) return;
    const urgent = next.phaseKey !== this.snapshot.phaseKey;
    if (!urgent && now - this.lastEmit < NUMERIC_EMIT_MS) return;
    this.snapshot = next;
    this.lastEmit = now;
    this.listeners.forEach((listener) => listener());
  }

  /* ---------- Lifecycle ---------- */

  attach({ track, renderer }) {
    this.track = track;
    this.renderer = renderer;
    this.setReducedMotion(this.reducedMotion);
    this.layout();
    this.lastScroll = this.scrollProgress();
    this.model.teleport(this.lastScroll);

    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("wheel", this.onUserInput, { passive: true });
    window.addEventListener("touchstart", this.onTouchStart, { passive: true });
    window.addEventListener("touchend", this.onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", this.onTouchEnd, { passive: true });

    this.lastTime = 0;
    this.frameId = window.requestAnimationFrame(this.tick);
  }

  detach() {
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("wheel", this.onUserInput);
    window.removeEventListener("touchstart", this.onTouchStart);
    window.removeEventListener("touchend", this.onTouchEnd);
    window.removeEventListener("touchcancel", this.onTouchEnd);
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.snapTimer);
    window.clearTimeout(this.pendingTimer);
    this.frameId = 0;
    this.pending = null;
    this.renderer = null;
    this.track = null;
  }

  setReducedMotion(reduced) {
    this.reducedMotion = reduced;
    this.model.reducedMotion = reduced;
    if (this.renderer) this.renderer.reducedMotion = reduced;
  }

  /* ---------- Scroll <-> progress ---------- */

  get lastStop() {
    return this.model.stopCount - 1;
  }

  layout() {
    if (!this.track) return;
    const viewport = window.innerHeight;
    this.stepPx = Math.max(1, viewport * this.stepViewports);
    this.track.style.height = `${Math.round(this.lastStop * this.stepPx + viewport)}px`;
    this.trackTop = this.track.getBoundingClientRect().top + window.scrollY;
    if (this.renderer) this.renderer.resize();
  }

  scrollProgress() {
    return clamp((window.scrollY - this.trackTop) / this.stepPx, 0, this.lastStop);
  }

  scrollToStop(stop, smooth) {
    const top = this.trackTop + stop * this.stepPx;
    window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }

  /* ---------- Commands (buttons, keys, view callbacks) ---------- */

  goTo = (index) => {
    const stop = clamp(Math.round(index), 0, this.lastStop);
    this.model.setTarget(stop);
    this.setPending(stop);
    this.scrollToStop(stop, !this.reducedMotion);
  };

  next = () => this.goTo(Math.floor(this.model.target + EPSILON) + 1);

  prev = () => this.goTo(Math.ceil(this.model.target - EPSILON) - 1);

  restart = () => {
    this.clearPending();
    this.model.teleport(0);
    this.scrollToStop(0, false);
  };

  /* While a button-driven scroll is in flight, hold the target on the
   * destination so the model never chases intermediate scroll positions. */
  setPending(stop) {
    this.pending = stop;
    window.clearTimeout(this.pendingTimer);
    this.pendingTimer = window.setTimeout(() => this.clearPending(), PENDING_TIMEOUT_MS);
  }

  clearPending() {
    this.pending = null;
    window.clearTimeout(this.pendingTimer);
  }

  /* ---------- DOM events ---------- */

  onScroll = () => {
    const progress = this.scrollProgress();
    const delta = progress - this.lastScroll;
    if (Math.abs(delta) > 1e-4) this.direction = Math.sign(delta);
    this.lastScroll = progress;

    if (this.pending !== null) {
      if (Math.abs(progress - this.pending) < 0.01) this.clearPending();
      return;
    }
    this.model.setTarget(progress);
    this.scheduleSnap();
  };

  scheduleSnap() {
    window.clearTimeout(this.snapTimer);
    this.snapTimer = window.setTimeout(this.snapToStop, SNAP_DELAY_MS);
  }

  snapToStop = () => {
    if (this.touching) {
      this.scheduleSnap();
      return;
    }
    const progress = this.scrollProgress();
    const base = Math.floor(progress);
    const frac = progress - base;
    if (frac < 0.002 || frac > 0.998) return;

    let stop = Math.round(progress);
    if (this.direction > 0) stop = frac > 0.12 ? base + 1 : base;
    if (this.direction < 0) stop = frac < 0.88 ? base : base + 1;
    this.goTo(stop);
  };

  onResize = () => {
    const atStop = Math.abs(this.model.target - Math.round(this.model.target)) < EPSILON;
    const stop = Math.round(this.model.target);
    this.layout();
    if (atStop) {
      this.clearPending();
      this.scrollToStop(stop, false);
    }
  };

  onUserInput = () => {
    if (this.pending !== null) this.clearPending();
  };

  onTouchStart = () => {
    this.touching = true;
    this.onUserInput();
  };

  onTouchEnd = () => {
    this.touching = false;
    this.scheduleSnap();
  };

  onKey = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    const tag = target && target.tagName;
    const typing =
      tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
    if (typing) return;
    const onControl = tag === "BUTTON" || tag === "A";

    let action = null;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
      case "PageDown":
        action = this.next;
        break;
      case "ArrowUp":
      case "ArrowLeft":
      case "PageUp":
        action = this.prev;
        break;
      case " ":
        if (!onControl) action = event.shiftKey ? this.prev : this.next;
        break;
      case "Home":
        action = () => this.goTo(0);
        break;
      case "End":
        action = () => this.goTo(this.lastStop);
        break;
      default:
        break;
    }
    if (!action) return;
    event.preventDefault();
    action();
  };

  /* ---------- Loop ---------- */

  tick = (time) => {
    const dt = this.lastTime ? (time - this.lastTime) / 1000 : 1 / 60;
    this.lastTime = time;
    this.model.step(dt);
    if (this.renderer) this.renderer.render(this.model.frame, dt);
    this.publish(time);
    this.frameId = window.requestAnimationFrame(this.tick);
  };
}
