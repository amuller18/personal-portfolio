import { useEffect, useMemo, useRef, useState } from "react";
import { useSite } from "../../context/SiteContext";
import { usePrefersReducedMotion } from "../../hooks/useInView";
import { mulberry32 } from "../../lib/sim";
import { Snowfall } from "./Doodles";

const TILT_SELECTOR = ".work-card, .goal, .activity, .stat, .flow__source, .versus__card";
const MAGNET_SELECTOR = ".btn";

/*
 * Desktop-only cursor effects: a soft spotlight that follows the mouse, cards
 * that tilt toward the pointer, and buttons that lean in magnetically.
 */
export function CursorEffects() {
  const reduced = usePrefersReducedMotion();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const finePointer = window.matchMedia?.("(pointer: fine)").matches;
    if (!finePointer || reduced) return undefined;

    const root = document.documentElement;
    let frame = 0;
    let lastEvent = null;
    let tiltEl = null;
    let magnetEl = null;

    const clear = (el, props) => props.forEach((p) => el.style.removeProperty(p));

    const apply = () => {
      frame = 0;
      const e = lastEvent;
      root.style.setProperty("--mx", `${e.clientX}px`);
      root.style.setProperty("--my", `${e.clientY}px`);

      const tilt = e.target.closest ? e.target.closest(TILT_SELECTOR) : null;
      if (tiltEl && tiltEl !== tilt) clear(tiltEl, ["--rx", "--ry", "--cx", "--cy"]);
      tiltEl = tilt;
      if (tilt) {
        const box = tilt.getBoundingClientRect();
        const px = (e.clientX - box.left) / box.width;
        const py = (e.clientY - box.top) / box.height;
        tilt.style.setProperty("--ry", `${((px - 0.5) * 8).toFixed(2)}deg`);
        tilt.style.setProperty("--rx", `${((0.5 - py) * 8).toFixed(2)}deg`);
        tilt.style.setProperty("--cx", `${(px * 100).toFixed(1)}%`);
        tilt.style.setProperty("--cy", `${(py * 100).toFixed(1)}%`);
      }

      const magnet = e.target.closest ? e.target.closest(MAGNET_SELECTOR) : null;
      if (magnetEl && magnetEl !== magnet) clear(magnetEl, ["--tx", "--ty"]);
      magnetEl = magnet;
      if (magnet) {
        const box = magnet.getBoundingClientRect();
        const dx = e.clientX - (box.left + box.width / 2);
        const dy = e.clientY - (box.top + box.height / 2);
        // Gentle pull, capped so neighbouring buttons never touch.
        const pull = (d, k, max) => Math.max(-max, Math.min(max, d * k)).toFixed(1);
        magnet.style.setProperty("--tx", `${pull(dx, 0.15, 5)}px`);
        magnet.style.setProperty("--ty", `${pull(dy, 0.25, 4)}px`);
      }
    };

    const onMove = (e) => {
      lastEvent = e;
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    const onLeave = () => {
      root.style.setProperty("--mx", "-999px");
      root.style.setProperty("--my", "-999px");
    };

    root.classList.add("cursor-fx");
    setEnabled(true);
    document.addEventListener("mousemove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      root.classList.remove("cursor-fx");
      setEnabled(false);
      document.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      if (frame) window.cancelAnimationFrame(frame);
      if (tiltEl) clear(tiltEl, ["--rx", "--ry", "--cx", "--cy"]);
      if (magnetEl) clear(magnetEl, ["--tx", "--ty"]);
    };
  }, [reduced]);

  return enabled ? <div className="spotlight" aria-hidden="true" /> : null;
}

/*
 * Giant outlined chapter numbers behind each chapter that drift as the
 * chapter scrolls past (parallax). Static for reduced motion.
 */
export function useChapterWatermarks(sections) {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const nodes = sections
      .map((section) => {
        const node = document.getElementById(section.id);
        if (node) node.dataset.num = section.number;
        return node;
      })
      .filter(Boolean);
    if (reduced) return undefined;

    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      nodes.forEach((node) => {
        const box = node.getBoundingClientRect();
        if (box.bottom < -vh || box.top > 2 * vh) return;
        const progress = (box.top + box.height / 2 - vh / 2) / vh;
        node.style.setProperty("--wm", progress.toFixed(3));
      });
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sections, reduced]);
}

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/* ⌘K / Ctrl+K and "/" open the palette; "ski" and the Konami code are eggs. */
export function Hotkeys() {
  const { paletteOpen, setPaletteOpen, trigger } = useSite();
  const keys = useRef([]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (paletteOpen || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys.current = [...keys.current, key].slice(-KONAMI.length);
      const recent = keys.current;
      if (KONAMI.every((k, i) => recent[i] === k)) {
        keys.current = [];
        trigger("confetti");
      } else if (recent.slice(-3).join("") === "ski") {
        keys.current = [];
        trigger("snow");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPaletteOpen, trigger]);

  return null;
}

const CONFETTI_COLORS = ["#7cf2c4", "#3987e5", "#fab219", "#e87ba4", "#ffffff", "#9085e9"];

function ConfettiBurst({ seed }) {
  const pieces = useMemo(() => {
    const rand = mulberry32(seed * 7919);
    return Array.from({ length: 140 }, () => ({
      left: `${rand() * 100}%`,
      color: CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)],
      width: `${6 + rand() * 6}px`,
      height: `${8 + rand() * 10}px`,
      duration: `${2.4 + rand() * 1.8}s`,
      delay: `${rand() * 0.5}s`,
      drift: `${(rand() - 0.5) * 240}px`,
      spin: `${(rand() > 0.5 ? 1 : -1) * (360 + rand() * 720)}deg`,
    }));
  }, [seed]);

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: p.left,
            width: p.width,
            height: p.height,
            background: p.color,
            animationDuration: p.duration,
            animationDelay: p.delay,
            "--drift": p.drift,
            "--spin": p.spin,
          }}
        />
      ))}
    </div>
  );
}

/* Renders whichever easter-egg effect was last triggered, plus a toast. */
export function EffectsLayer() {
  const { effects } = useSite();
  const [snowing, setSnowing] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!effects.snow) return undefined;
    setSnowing(true);
    const id = window.setTimeout(() => setSnowing(false), 10000);
    return () => window.clearTimeout(id);
  }, [effects.snow]);

  useEffect(() => {
    if (!effects.confetti) return undefined;
    setConfetti(effects.confetti);
    const id = window.setTimeout(() => setConfetti(0), 5000);
    return () => window.clearTimeout(id);
  }, [effects.confetti]);

  useEffect(() => {
    if (!effects.toast) return undefined;
    setToast(effects.toast);
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [effects.toast]);

  return (
    <>
      {snowing && (
        <div className="fx-snow" aria-hidden="true">
          <Snowfall count={140} />
        </div>
      )}
      {confetti > 0 && <ConfettiBurst key={confetti} seed={confetti} />}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <p key={toast.id} className="toast">
            {toast.text}
          </p>
        )}
      </div>
    </>
  );
}
