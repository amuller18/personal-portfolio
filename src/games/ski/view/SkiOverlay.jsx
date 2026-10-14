/*
 * DOM half of the view: HUD, checkpoint cards and trick callouts. Everything
 * here is driven by the model's coarse snapshot; every button calls a
 * controller command and never touches the model directly.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const pad = (value, length = 6) => String(value).padStart(length, "0");
const formatNumber = (value) => value.toLocaleString("en-US");

function Hud({ snapshot, stops, jumps, onSelect }) {
  const lastStop = stops.length - 1;
  const checkpoints = lastStop - 1;
  const nearest = stops[snapshot.nearestStop];
  const where =
    nearest.kind === "chapter"
      ? `CP ${nearest.number}/${String(checkpoints).padStart(2, "0")}`
      : nearest.kind.toUpperCase();
  return (
    <header className="ski-hud">
      <div className="ski-hud__group">
        <Link to="/" className="ski-hud__home" aria-label="Back to the classic site">
          ⌂
        </Link>
        <div className="ski-hud__stat">
          <span className="ski-hud__label">Score</span>
          <span className="ski-hud__value">{pad(snapshot.score)}</span>
        </div>
        <div className="ski-hud__stat ski-hud__stat--wide">
          <span className="ski-hud__label">Tricks</span>
          <span className="ski-hud__value">
            {snapshot.landedCount}/{jumps.length}
          </span>
        </div>
      </div>

      <nav className="ski-map" aria-label="Checkpoints">
        <div className="ski-map__track">
          <div className="ski-map__fill" style={{ transform: `scaleX(${snapshot.progress})` }} />
          {stops.map((stop, index) => (
            <button
              key={stop.id}
              type="button"
              className={`ski-map__pip ski-map__pip--${stop.kind} ${
                snapshot.progress * lastStop >= index - 0.02 ? "is-done" : ""
              } ${snapshot.nearestStop === index ? "is-current" : ""}`}
              style={{ left: `${(index / lastStop) * 100}%` }}
              onClick={() => onSelect(index)}
              aria-label={
                stop.kind === "chapter" ? `Ski to chapter ${stop.number}: ${stop.title}` : `Ski to the ${stop.kind}`
              }
            />
          ))}
        </div>
        <span className="ski-map__label">{where}</span>
      </nav>

      <div className="ski-hud__group ski-hud__group--right">
        <div className="ski-hud__stat">
          <span className="ski-hud__label">Elev</span>
          <span className="ski-hud__value">{formatNumber(snapshot.elevation)}&apos;</span>
        </div>
        <div className="ski-hud__stat">
          <span className="ski-hud__label">Speed</span>
          <span className="ski-hud__value">
            {pad(snapshot.speed, 3)}
            <small>km/h</small>
          </span>
        </div>
      </div>
    </header>
  );
}

function TrickCallout({ snapshot, jumps }) {
  if (snapshot.trick >= 0) {
    const { trick } = jumps[snapshot.trick];
    return (
      <div className="ski-callout" key={`air-${snapshot.trick}`} aria-hidden="true">
        <span className="ski-callout__name">{trick.name}!</span>
      </div>
    );
  }
  if (snapshot.landed >= 0) {
    const { trick } = jumps[snapshot.landed];
    return (
      <div className="ski-callout ski-callout--landed" key={`land-${snapshot.landed}`} aria-hidden="true">
        <span className="ski-callout__points">+{trick.points}</span>
        <span className="ski-callout__note">Stomped it</span>
      </div>
    );
  }
  if (snapshot.rewinding) {
    return (
      <div className="ski-callout ski-callout--rewind" aria-hidden="true">
        <span className="ski-callout__note">◀◀ Rewind</span>
      </div>
    );
  }
  return null;
}

function NextButton({ nextTrick, onNext, label }) {
  return (
    <button type="button" className="ski-btn ski-btn--primary" onClick={onNext}>
      {label ?? "Next run"} ▶
      {nextTrick && <span className="ski-btn__sub">Up next: {nextTrick.name}</span>}
    </button>
  );
}

function StartCard({ stop, nextTrick, onNext }) {
  return (
    <>
      <p className="ski-card__eyebrow">Player 1 · Ready</p>
      <h1 className="ski-card__title ski-card__title--hero">{stop.title}</h1>
      <p className="ski-card__subtitle">Ski the story</p>
      <ul className="ski-card__lines">
        {stop.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="ski-card__body">{stop.headline}</p>
      <div className="ski-card__actions">
        <NextButton onNext={onNext} nextTrick={nextTrick} label="Drop in" />
      </div>
      <p className="ski-card__hint">
        Scroll, swipe, or press <kbd>Space</kbd>
      </p>
    </>
  );
}

function ChapterCard({ stop, index, checkpoints, nextTrick, onNext, onPrev }) {
  return (
    <>
      <p className="ski-card__eyebrow">
        Checkpoint {String(index).padStart(2, "0")}/{String(checkpoints).padStart(2, "0")}
        <span className="ski-card__era">{stop.era}</span>
      </p>
      <h2 className="ski-card__title">{stop.title}</h2>
      <p className="ski-card__headline">{stop.headline}</p>
      {stop.summary && <p className="ski-card__body">{stop.summary}</p>}
      {stop.stats.length > 0 && (
        <ul className="ski-card__loot">
          {stop.stats.map((stat) => (
            <li key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </li>
          ))}
        </ul>
      )}
      {stop.bullets.length > 0 && (
        <ul className="ski-card__quests">
          {stop.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
      {stop.lesson && (
        <blockquote className="ski-card__lesson">
          <span>★ Lesson unlocked</span>
          <p>{stop.lesson}</p>
        </blockquote>
      )}
      <div className="ski-card__actions">
        <button type="button" className="ski-btn" onClick={onPrev} aria-label="Back to the previous checkpoint">
          ◀
        </button>
        <NextButton onNext={onNext} nextTrick={nextTrick} />
      </div>
      <a className="ski-card__more" href={stop.href}>
        Read the full chapter ↗
      </a>
    </>
  );
}

function FinishCard({ stop, snapshot, jumps, onRestart, onPrev }) {
  const best = jumps.reduce((total, jump) => total + jump.trick.points, 0);
  return (
    <>
      <p className="ski-card__eyebrow">Course complete</p>
      <h2 className="ski-card__title ski-card__title--hero">Finish!</h2>
      <dl className="ski-card__results">
        <div>
          <dt>Final score</dt>
          <dd>{pad(snapshot.score)}</dd>
        </div>
        <div>
          <dt>Tricks landed</dt>
          <dd>
            {snapshot.landedCount}/{jumps.length}
          </dd>
        </div>
      </dl>
      {snapshot.score === best && <p className="ski-card__badge">★ Perfect run ★</p>}
      <p className="ski-card__body">{stop.headline}</p>
      <div className="ski-card__links">
        {stop.links.map((link) => (
          <a key={link.label} className="ski-btn ski-btn--small" href={link.href} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
      </div>
      <div className="ski-card__actions">
        <button type="button" className="ski-btn" onClick={onPrev} aria-label="Back to the previous checkpoint">
          ◀
        </button>
        <button type="button" className="ski-btn ski-btn--primary" onClick={onRestart}>
          ↻ Ride again
        </button>
      </div>
      <Link className="ski-card__more" to="/">
        Back to the classic site ↗
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

function StopCard({ snapshot, stops, jumps, controller }) {
  const index = useLingering(snapshot.activeStop);
  if (index < 0) return null;
  const stop = stops[index];
  const leaving = snapshot.activeStop !== index;
  const nextTrick = jumps[index] ? jumps[index].trick : null;
  const checkpoints = stops.length - 2;

  return (
    <section
      key={stop.id}
      className={`ski-card ski-card--${stop.kind} ${leaving ? "is-leaving" : ""}`}
      aria-label={stop.kind === "chapter" ? `Chapter ${stop.number}: ${stop.title}` : stop.title}
      aria-hidden={leaving}
    >
      {stop.kind === "start" && <StartCard stop={stop} nextTrick={nextTrick} onNext={controller.next} />}
      {stop.kind === "chapter" && (
        <ChapterCard
          stop={stop}
          index={index}
          checkpoints={checkpoints}
          nextTrick={nextTrick}
          onNext={controller.next}
          onPrev={controller.prev}
        />
      )}
      {stop.kind === "finish" && (
        <FinishCard
          stop={stop}
          snapshot={snapshot}
          jumps={jumps}
          onRestart={controller.restart}
          onPrev={controller.prev}
        />
      )}
    </section>
  );
}

export default function SkiOverlay({ snapshot, course, controller }) {
  const { stops, jumps } = course;
  const active = stops[snapshot.activeStop];
  return (
    <div className="ski-overlay">
      <Hud snapshot={snapshot} stops={stops} jumps={jumps} onSelect={controller.goTo} />
      <TrickCallout snapshot={snapshot} jumps={jumps} />
      <StopCard snapshot={snapshot} stops={stops} jumps={jumps} controller={controller} />
      <div className="ski-pad" aria-label="Ride controls">
        <button type="button" className="ski-btn ski-btn--icon" onClick={controller.prev} aria-label="Previous checkpoint">
          ▲
        </button>
        <button type="button" className="ski-btn ski-btn--icon" onClick={controller.next} aria-label="Next checkpoint">
          ▼
        </button>
      </div>
      <p className="ski-sr" aria-live="polite">
        {active ? `Arrived at ${active.kind === "chapter" ? `chapter ${active.number}: ` : ""}${active.title}` : ""}
      </p>
    </div>
  );
}
