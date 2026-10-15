/*
 * DOM half of the view: HUD, topo rail, callouts and the guidebook cards at
 * each anchor. Everything here is driven by the model's coarse snapshot;
 * every button calls a controller command and never touches the model.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CountUp from "../../ski/view/CountUp";

const ACCENTS = ["#ff6b3d", "#2bd9a0", "#ffd23f", "#5ef0ff", "#c77dff", "#e8467c"];
export const accentFor = (stop, index) => {
  if (stop.kind === "start") return "#ff6b3d";
  if (stop.kind === "finish") return "#ffd23f";
  return ACCENTS[index % ACCENTS.length];
};

const pad = (value, length = 6) => String(value).padStart(length, "0");
const two = (value) => String(value).padStart(2, "0");
const formatNumber = (value) => value.toLocaleString("en-US");

/* Entrance order for staggered card sections. */
const step = (i) => ({ "--i": i });

function Hud({ snapshot, route }) {
  const pitch = route.pitches[snapshot.pitch];
  const where = snapshot.nearestStop === 0 ? "BASE" : snapshot.nearestStop === route.stopCount - 1 ? "SUMMIT" : null;
  return (
    <header className="climb-hud">
      <div className="climb-hud__group">
        <Link to="/" className="climb-hud__home" aria-label="Back to the classic site">
          ⌂
        </Link>
        <div className="climb-hud__stat">
          <span className="climb-hud__label">Score</span>
          <span className="climb-hud__value">{pad(snapshot.score)}</span>
        </div>
        <div className="climb-hud__stat climb-hud__stat--wide">
          <span className="climb-hud__label">Sends</span>
          <span className="climb-hud__value">
            {snapshot.sentCount}/{route.pitchCount}
          </span>
        </div>
      </div>
      <div className="climb-hud__pitch" aria-hidden="true">
        {where || (
          <>
            P{two(snapshot.pitch + 1)} <span className="climb-hud__grade">{pitch.grade}</span>
          </>
        )}
      </div>
      <div className="climb-hud__group climb-hud__group--right">
        <div className="climb-hud__stat">
          <span className="climb-hud__label">Height</span>
          <span className="climb-hud__value">{formatNumber(snapshot.height)}&apos;</span>
        </div>
      </div>
    </header>
  );
}

/* Vertical topo on the left edge: one pip per anchor, bottom to top. */
function Topo({ snapshot, stops, onSelect }) {
  const lastStop = stops.length - 1;
  return (
    <nav className="climb-topo" aria-label="Anchors">
      <div className="climb-topo__track">
        <div className="climb-topo__fill" style={{ transform: `scaleY(${snapshot.progress})` }} />
        {stops.map((stop, index) => (
          <button
            key={stop.id}
            type="button"
            className={`climb-topo__pip climb-topo__pip--${stop.kind} ${
              snapshot.progress * lastStop >= index - 0.02 ? "is-done" : ""
            } ${snapshot.nearestStop === index ? "is-current" : ""}`}
            style={{ bottom: `${(index / lastStop) * 100}%`, "--accent": accentFor(stop, index) }}
            onClick={() => onSelect(index)}
            aria-label={
              stop.kind === "chapter"
                ? `Climb to chapter ${stop.number}: ${stop.title}`
                : `Go to the ${stop.kind === "start" ? "base" : "summit"}`
            }
          >
            <span className="climb-topo__tip">
              {stop.kind === "chapter" ? stop.title : stop.kind === "start" ? "Base" : "Summit"}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Callout({ snapshot, route }) {
  if (snapshot.fall) {
    return (
      <div className="climb-callout climb-callout--fall" key="fall" aria-hidden="true">
        <span className="climb-callout__name">Whipper!</span>
        <span className="climb-callout__note">Rope caught it</span>
      </div>
    );
  }
  if (snapshot.crux) {
    return (
      <div className="climb-callout" key={`crux-${snapshot.pitch}`} aria-hidden="true">
        <span className="climb-callout__name">Crux!</span>
      </div>
    );
  }
  if (snapshot.sent >= 0) {
    const pitch = route.pitches[snapshot.sent];
    return (
      <div className="climb-callout climb-callout--sent" key={`sent-${snapshot.sent}`} aria-hidden="true">
        <span className="climb-callout__points">+{pitch.points}</span>
        <span className="climb-callout__note">Sent {pitch.grade}</span>
      </div>
    );
  }
  if (snapshot.rewinding) {
    return (
      <div className="climb-callout climb-callout--rewind" aria-hidden="true">
        <span className="climb-callout__note">▼ Downclimb</span>
      </div>
    );
  }
  return null;
}

function NextButton({ nextPitch, onNext, label, i }) {
  return (
    <button type="button" className="climb-btn climb-btn--primary climb-in" style={step(i)} onClick={onNext}>
      <span className="climb-btn__main">{label ?? "Climb on"} ▲</span>
      {nextPitch && (
        <span className="climb-btn__sub">
          Next · {nextPitch.name} {nextPitch.grade}
        </span>
      )}
    </button>
  );
}

function StartCard({ stop, nextPitch, onNext, totalFeet }) {
  const [first, ...rest] = stop.title.split(" ");
  return (
    <>
      <p className="climb-card__kicker climb-in" style={step(0)}>
        <span className="climb-dot" /> On belay?
      </p>
      <h1 className="climb-logo climb-in" style={step(1)}>
        <span className="climb-logo__name">
          {first}
          <br />
          {rest.join(" ")}
        </span>
        <span className="climb-logo__sub">Climb the story</span>
      </h1>
      <ul className="climb-card__roles climb-in" style={step(2)}>
        {stop.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="climb-card__body climb-in" style={step(3)}>
        {stop.headline}
      </p>
      <p className="climb-card__beta climb-in" style={step(4)}>
        {formatNumber(totalFeet)}&apos; of sandstone, one pitch per chapter.
      </p>
      <ul className="climb-legend climb-in" style={step(4)} aria-label="Controls">
        <li>
          <kbd>Scroll</kbd> climb
        </li>
        <li>
          <kbd>Space</kbd> next pitch
        </li>
        <li>
          <kbd>●</kbd> jump to an anchor
        </li>
      </ul>
      <div className="climb-card__actions">
        <NextButton onNext={onNext} nextPitch={nextPitch} label="Climbing!" i={5} />
      </div>
    </>
  );
}

function ChapterCard({ stop, index, pitch, checkpoints, nextPitch, onNext, onPrev }) {
  return (
    <>
      <header className="climb-card__head climb-in" style={step(0)}>
        <span className="climb-card__num">{stop.number}</span>
        <div className="climb-card__meta">
          <span className="climb-card__kicker">
            Anchor {two(index)} / {two(checkpoints)} · {pitch.grade}
          </span>
          <span className="climb-card__route">{pitch.name}</span>
          <span className="climb-card__era">{stop.era}</span>
        </div>
      </header>
      <h2 className="climb-card__title climb-in" style={step(1)}>
        {stop.title}
      </h2>
      <p className="climb-card__headline climb-in" style={step(2)}>
        {stop.headline}
      </p>
      {stop.summary && (
        <p className="climb-card__body climb-in" style={step(3)}>
          {stop.summary}
        </p>
      )}
      {stop.stats.length > 0 && (
        <ul className="climb-stats climb-in" style={step(4)}>
          {stop.stats.map((stat, i) => (
            <li key={stat.label}>
              <strong>
                <CountUp value={stat.value} delay={450 + i * 120} />
              </strong>
              <span className="climb-stats__label">{stat.label}</span>
            </li>
          ))}
        </ul>
      )}
      {stop.bullets.length > 0 && (
        <ul className="climb-ticks climb-in" style={step(4)}>
          {stop.bullets.map((bullet) => (
            <li key={bullet}>
              <span className="climb-ticks__box" aria-hidden="true" />
              {bullet}
            </li>
          ))}
        </ul>
      )}
      {stop.lesson && (
        <aside className="climb-beta climb-in" style={step(5)}>
          <span className="climb-beta__label">Beta</span>
          <p>{stop.lesson}</p>
        </aside>
      )}
      <div className="climb-card__actions">
        <button
          type="button"
          className="climb-btn climb-btn--ghost climb-in"
          style={step(6)}
          onClick={onPrev}
          aria-label="Back down to the previous anchor"
        >
          ▼
        </button>
        <NextButton onNext={onNext} nextPitch={nextPitch} i={6} />
      </div>
      <a className="climb-card__more climb-in" style={step(7)} href={stop.href}>
        Read the full chapter →
      </a>
    </>
  );
}

function FinishCard({ stop, snapshot, route, onRestart, onPrev }) {
  const style = snapshot.downclimbed
    ? { letter: "RP", name: "Redpoint", note: "Worked it out. Still counts." }
    : { letter: "OS", name: "Onsight", note: "First try, no downclimbing. (We don't talk about the whipper.)" };
  return (
    <>
      <p className="climb-card__kicker climb-in" style={step(0)}>
        <span className="climb-dot climb-dot--gold" /> Topped out
      </p>
      <div className="climb-results climb-in" style={step(1)}>
        <div className="climb-rank" aria-label={`Style: ${style.name}`}>
          <span className="climb-rank__letter">{style.letter}</span>
          <span className="climb-rank__note">{style.name}</span>
        </div>
        <dl className="climb-results__stats">
          <div>
            <dt>Final score</dt>
            <dd>
              <CountUp value={snapshot.score} duration={1400} delay={300} format={(n) => pad(n)} />
            </dd>
          </div>
          <div>
            <dt>Pitches sent</dt>
            <dd>
              {snapshot.sentCount}/{route.pitchCount}
            </dd>
          </div>
          <div>
            <dt>Height</dt>
            <dd>{formatNumber(route.totalFeet)}&apos;</dd>
          </div>
        </dl>
      </div>
      <p className="climb-card__beta climb-in" style={step(2)}>
        {style.note}
      </p>
      <h2 className="climb-card__title climb-in" style={step(2)}>
        Thanks for the catch.
      </h2>
      <p className="climb-card__body climb-in" style={step(3)}>
        {stop.headline}
      </p>
      <div className="climb-links climb-in" style={step(4)}>
        {stop.links.map((link) => (
          <a key={link.label} className="climb-btn climb-btn--small" href={link.href} target="_blank" rel="noreferrer">
            {link.label} ↗
          </a>
        ))}
      </div>
      <div className="climb-card__actions">
        <button
          type="button"
          className="climb-btn climb-btn--ghost climb-in"
          style={step(5)}
          onClick={onPrev}
          aria-label="Back down to the previous anchor"
        >
          ▼
        </button>
        <button type="button" className="climb-btn climb-btn--primary climb-in" style={step(5)} onClick={onRestart}>
          <span className="climb-btn__main">↻ Climb again</span>
        </button>
      </div>
      <Link className="climb-card__more climb-in" style={step(6)} to="/">
        Back to the classic site →
      </Link>
    </>
  );
}

/* Keeps the last card mounted while it animates out. */
function useLingering(activeStop) {
  const [shown, setShown] = useState(activeStop);
  useEffect(() => {
    if (activeStop >= 0) setShown(activeStop);
  }, [activeStop]);
  return activeStop >= 0 ? activeStop : shown;
}

function StopCard({ snapshot, route, controller }) {
  const { stops, pitches } = route;
  const index = useLingering(snapshot.activeStop);
  if (index < 0) return null;
  const stop = stops[index];
  const leaving = snapshot.activeStop !== index;
  const nextPitch = pitches[index] || null;

  return (
    <section
      key={stop.id}
      className={`climb-card climb-card--${stop.kind} ${leaving ? "is-leaving" : ""}`}
      style={{ "--accent": accentFor(stop, index) }}
      aria-label={stop.kind === "chapter" ? `Chapter ${stop.number}: ${stop.title}` : stop.title}
      aria-hidden={leaving}
    >
      {stop.kind === "start" && (
        <StartCard stop={stop} nextPitch={nextPitch} onNext={controller.next} totalFeet={route.totalFeet} />
      )}
      {stop.kind === "chapter" && (
        <ChapterCard
          stop={stop}
          index={index}
          pitch={pitches[index - 1]}
          checkpoints={stops.length - 2}
          nextPitch={nextPitch}
          onNext={controller.next}
          onPrev={controller.prev}
        />
      )}
      {stop.kind === "finish" && (
        <FinishCard
          stop={stop}
          snapshot={snapshot}
          route={route}
          onRestart={controller.restart}
          onPrev={controller.prev}
        />
      )}
    </section>
  );
}

export default function ClimbOverlay({ snapshot, route, controller }) {
  const active = route.stops[snapshot.activeStop];
  return (
    <div className="climb-overlay">
      <Hud snapshot={snapshot} route={route} />
      <Topo snapshot={snapshot} stops={route.stops} onSelect={controller.goTo} />
      <Callout snapshot={snapshot} route={route} />
      <StopCard snapshot={snapshot} route={route} controller={controller} />
      <div className="climb-pad" aria-label="Climb controls">
        <button
          type="button"
          className="climb-btn climb-btn--icon"
          onClick={controller.next}
          aria-label="Climb to the next anchor"
        >
          ▲
        </button>
        <button
          type="button"
          className="climb-btn climb-btn--icon"
          onClick={controller.prev}
          aria-label="Back down to the previous anchor"
        >
          ▼
        </button>
      </div>
      <p className="climb-sr" aria-live="polite">
        {active ? `Reached ${active.kind === "chapter" ? `chapter ${active.number}: ` : ""}${active.title}` : ""}
      </p>
    </div>
  );
}
