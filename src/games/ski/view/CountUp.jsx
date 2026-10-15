import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "../../../hooks/useInView";

/* Counts the numeric part of a value ("$10K+", "4+ hrs", 4850) up from zero. */
export default function CountUp({ value, duration = 900, delay = 0, format = (n) => n }) {
  const text = String(value);
  const match = /^([^0-9]*)([\d,]+)(.*)$/.exec(text);
  const hasNumber = Boolean(match);
  const target = match ? Number(match[2].replace(/,/g, "")) : 0;
  const reduced = usePrefersReducedMotion();
  const [current, setCurrent] = useState(reduced ? target : 0);

  useEffect(() => {
    if (!hasNumber) return undefined;
    if (reduced) {
      setCurrent(target);
      return undefined;
    }
    let frame = 0;
    let start = 0;
    const tick = (now) => {
      if (!start) start = now + delay;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      setCurrent(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [hasNumber, target, reduced, duration, delay]);

  if (!match) return <span>{text}</span>;
  return (
    <span aria-label={text}>
      <span aria-hidden="true">
        {match[1]}
        {format(current)}
        {match[3]}
      </span>
    </span>
  );
}
