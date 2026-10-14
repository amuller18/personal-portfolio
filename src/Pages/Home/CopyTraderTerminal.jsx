import { useEffect, useState } from "react";
import useInView, { usePrefersReducedMotion } from "../../hooks/useInView";

/* An illustrative replay of the copy-trader's decision loop. */
const LINES = [
  { t: "info", text: "listening for new calls across sources…" },
  { t: "in", text: "NEW CALL  @chart_wizard → $TOKEN" },
  { t: "info", text: "caller score 76 ≥ threshold 60 ✓" },
  { t: "info", text: "load swept exit: take-profit +50% / stop-loss −20%" },
  { t: "out", text: "SWAP  buy $TOKEN via DEX router … submitted" },
  { t: "ok", text: "confirmed on-chain · position open" },
  { t: "info", text: "watching price for exit…" },
  { t: "ok", text: "TAKE-PROFIT hit · position closed" },
  { t: "in", text: "NEW CALL  @degen_oracle → $OTHER" },
  { t: "warn", text: "caller score 0 < threshold 60 · skipped" },
];

export default function CopyTraderTerminal() {
  const [ref, inView] = useInView({ threshold: 0.4 });
  const reduced = usePrefersReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return undefined;
    if (reduced) {
      setCount(LINES.length);
      return undefined;
    }
    const id = window.setInterval(() => {
      setCount((c) => (c >= LINES.length + 4 ? 0 : c + 1));
    }, 700);
    return () => window.clearInterval(id);
  }, [inView, reduced]);

  return (
    <div
      ref={ref}
      className="terminal"
      role="img"
      aria-label="Illustration of the copy trader's decision log"
    >
      <div className="terminal__bar">
        <span />
        <span />
        <span />
        <em>copy-trader.log · illustrative</em>
      </div>
      <pre className="terminal__body" aria-hidden="true">
        {LINES.slice(0, Math.min(count, LINES.length)).map((line, i) => (
          <div key={i} className={`terminal__line terminal__line--${line.t}`}>
            <span className="terminal__prompt">›</span> {line.text}
          </div>
        ))}
        <span className="terminal__cursor" />
      </pre>
    </div>
  );
}
