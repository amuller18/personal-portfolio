/*
 * Small looping animations that sit in the empty space beside each chapter.
 * Each one only runs while it is on screen, and shows its finished state to
 * readers who prefer reduced motion. All of them are illustrative.
 */
import { useEffect, useMemo, useState } from "react";
import useInView, { usePrefersReducedMotion } from "../../hooks/useInView";
import { mulberry32 } from "../../lib/sim";

/* Steps 0..length-1 on an interval while `running`, looping forever. */
function useTicker(length, interval, running, reduced) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!running || reduced) return undefined;
    const id = window.setInterval(() => setStep((s) => (s + 1) % length), interval);
    return () => window.clearInterval(id);
  }, [length, interval, running, reduced]);

  return reduced ? length - 1 : step;
}

function useDoodle(length, interval) {
  const [ref, inView] = useInView({ threshold: 0.3, once: false });
  const reduced = usePrefersReducedMotion();
  const step = useTicker(length, interval, inView, reduced);
  return { ref, step, reduced };
}

function Frame({ frameRef, label, children, className = "" }) {
  return (
    <div ref={frameRef} className={`doodle ${className}`.trim()} aria-hidden="true">
      <span className="doodle__label">{label}</span>
      {children}
    </div>
  );
}

/* Chapter 01: the bot checks out while everyone else is still clicking. */
export function CheckoutRace() {
  const { ref, step } = useDoodle(2, 4200);
  const racers = [
    { name: "Scottybot", bot: true },
    { name: "Everyone else", bot: false },
    { name: "You, refreshing", bot: false },
  ];

  return (
    <Frame frameRef={ref} label="Limited drop · live">
      <div className="race" key={step}>
        {racers.map((racer, i) => (
          <div key={racer.name} className={`race__row ${racer.bot ? "is-bot" : ""}`}>
            <span className="race__name">{racer.name}</span>
            <span className="race__track">
              <span className="race__bar" style={{ "--i": i }} />
            </span>
            <span className="race__result">{racer.bot ? "✓ checked out" : "sold out"}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* Chapter 02: scattered emails settle into clusters; leftovers stay noise. */
const CLUSTER_COLORS = ["#3987e5", "#d95926", "#199e70"];
const CLUSTERS = [
  { x: 60, y: 62, label: "billing" },
  { x: 200, y: 52, label: "insurance" },
  { x: 132, y: 138, label: "plans" },
];

export function ClusterDoodle() {
  const { ref, step } = useDoodle(2, 2600);
  const clustered = step === 1;

  const points = useMemo(() => {
    const rand = mulberry32(42);
    return Array.from({ length: 42 }, (_, i) => {
      const cluster = i < 34 ? i % 3 : -1;
      const home = CLUSTERS[cluster] || { x: 20 + rand() * 220, y: 20 + rand() * 140 };
      const angle = rand() * Math.PI * 2;
      const radius = cluster >= 0 ? rand() * 18 : 0;
      return {
        cluster,
        from: { x: 12 + rand() * 236, y: 12 + rand() * 156 },
        to: { x: home.x + Math.cos(angle) * radius, y: home.y + Math.sin(angle) * radius },
      };
    });
  }, []);

  return (
    <Frame frameRef={ref} label={clustered ? "HDBSCAN · clustered" : "raw inbox · embedded"}>
      <svg className="clusters" viewBox="0 0 260 180">
        {points.map((p, i) => {
          const at = clustered ? p.to : p.from;
          const fill = clustered && p.cluster >= 0 ? CLUSTER_COLORS[p.cluster] : "#5b5b57";
          return (
            <circle
              key={i}
              r="4"
              style={{ transform: `translate(${at.x}px, ${at.y}px)`, fill }}
              className="clusters__dot"
            />
          );
        })}
        {CLUSTERS.map((c) => (
          <text
            key={c.label}
            x={c.x}
            y={c.y - 26}
            textAnchor="middle"
            className={`clusters__label ${clustered ? "is-on" : ""}`}
          >
            {c.label}
          </text>
        ))}
      </svg>
    </Frame>
  );
}

/* Chapter 04: booking texts arriving one after another. */
const MESSAGES = [
  "Your session is confirmed for Thu 3:00 PM ✓",
  "Payment received via Stripe ✓",
  "Reminder: your session starts in 1 hour",
  "Need to reschedule? Reply C to cancel.",
];

export function SmsDoodle() {
  const { ref, step } = useDoodle(MESSAGES.length + 2, 1300);
  const shown = Math.min(step + 1, MESSAGES.length);

  return (
    <Frame frameRef={ref} label="TutorMatch · SMS" className="doodle--phone">
      <div className="sms">
        {MESSAGES.slice(0, shown).map((text) => (
          <p key={text} className="sms__bubble">
            {text}
          </p>
        ))}
        {shown < MESSAGES.length && (
          <span className="sms__typing">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
    </Frame>
  );
}

/* Chapter 06: the scheduled pipeline run ticking through every sector. */
const SECTORS = ["Rail", "Energy", "Consumer", "Healthcare", "Telecom", "Macro"];

export function PipelineRun() {
  const { ref, step } = useDoodle(SECTORS.length + 3, 700);

  return (
    <Frame frameRef={ref} label="Scheduled run · unattended">
      <ul className="run">
        {SECTORS.map((sector, i) => {
          const state = i < step ? "done" : i === step ? "busy" : "wait";
          return (
            <li key={sector} className={`run__row is-${state}`}>
              <span className="run__icon">{state === "done" ? "✓" : ""}</span>
              {sector}
              <span className="run__status">
                {state === "done" ? "loaded" : state === "busy" ? "fetching…" : "queued"}
              </span>
            </li>
          );
        })}
        <li className={`run__row run__row--out ${step >= SECTORS.length ? "is-done" : ""}`}>
          → SQL + analyst workbooks
        </li>
      </ul>
    </Frame>
  );
}

/* Chapter 07: purchases and sales landing in one ledger. */
const ENTRIES = [
  { dir: "in", text: "Sold · eBay" },
  { dir: "out", text: "Bought · receipt from Gmail" },
  { dir: "out", text: "Card charge · via Plaid" },
  { dir: "in", text: "Sold · Tradepost" },
];

export function LedgerDoodle() {
  const { ref, step } = useDoodle(ENTRIES.length + 3, 900);
  const shown = Math.min(step, ENTRIES.length);

  return (
    <Frame frameRef={ref} label="Ledger · syncing">
      <ul className="ledger">
        {ENTRIES.slice(0, shown).map((entry) => (
          <li key={entry.text} className={`ledger__row is-${entry.dir}`}>
            <span>{entry.dir === "in" ? "▲" : "▼"}</span>
            {entry.text}
          </li>
        ))}
      </ul>
      <div className="ledger__pnl">
        <span>P&amp;L</span>
        <span className="ledger__track">
          <span className="ledger__bar" style={{ width: `${(shown / ENTRIES.length) * 100}%` }} />
        </span>
      </div>
    </Frame>
  );
}

/* Chapter 08: a roadmap that draws itself, with a traveller on the path. */
const ROAD = "M14 120 C 70 120, 70 40, 130 60 S 190 130, 246 34";

export function RoadmapDoodle() {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const reduced = usePrefersReducedMotion();
  const stops = [
    [14, 120],
    [92, 70],
    [168, 90],
    [246, 34],
  ];

  return (
    <Frame frameRef={ref} label="Roadmap">
      <svg className={`road ${inView ? "is-in" : ""}`} viewBox="0 0 260 150">
        <path d={ROAD} className="road__path" pathLength="1" />
        {stops.map(([x, y], i) => (
          <g key={x} className="road__stop" style={{ "--i": i }}>
            <circle cx={x} cy={y} r="6" />
            <text x={x} y={y + 22} textAnchor="middle">
              {String(i + 1).padStart(2, "0")}
            </text>
          </g>
        ))}
        {inView && !reduced && (
          <circle r="4" className="road__traveller">
            <animateMotion dur="5s" repeatCount="indefinite" path={ROAD} />
          </circle>
        )}
        <text x="14" y="104" textAnchor="middle" className="road__end">
          now
        </text>
        <text x="246" y="18" textAnchor="end" className="road__end">
          2028 →
        </text>
      </svg>
    </Frame>
  );
}

/* Chapter 03 backdrop: gentle snowfall over the ridgelines. */
export function Snowfall({ count = 70 }) {
  const flakes = useMemo(() => {
    const rand = mulberry32(1225);
    return Array.from({ length: count }, () => ({
      left: `${rand() * 100}%`,
      size: `${2 + rand() * 4}px`,
      duration: `${12 + rand() * 14}s`,
      delay: `${-rand() * 26}s`,
      drift: `${(rand() - 0.5) * 80}px`,
      opacity: 0.35 + rand() * 0.55,
    }));
  }, [count]);

  return (
    <div className="snow" aria-hidden="true">
      {flakes.map((f, i) => (
        <span
          key={i}
          style={{
            left: f.left,
            width: f.size,
            height: f.size,
            opacity: f.opacity,
            animationDuration: f.duration,
            animationDelay: f.delay,
            "--drift": f.drift,
          }}
        />
      ))}
    </div>
  );
}

/* Counts the leading number of a stat ("$10K+", "4+ hrs") up from zero. */
export function CountUp({ value }) {
  const match = /^([^0-9]*)(\d+)(.*)$/.exec(value);
  const hasNumber = Boolean(match);
  const target = match ? Number(match[2]) : 0;
  const [ref, inView] = useInView({ threshold: 0.2 });
  const reduced = usePrefersReducedMotion();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!hasNumber || !inView) return undefined;
    if (reduced) {
      setCurrent(target);
      return undefined;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 1200);
      setCurrent(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [hasNumber, inView, reduced, target]);

  if (!match) return <span className="stat__value">{value}</span>;
  return (
    <span ref={ref} className="stat__value" aria-label={value}>
      <span aria-hidden="true">
        {match[1]}
        {current}
        {match[3]}
      </span>
    </span>
  );
}
