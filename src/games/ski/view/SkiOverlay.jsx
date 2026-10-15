/*
 * DOM half of the view: HUD, checkpoint cards and trick callouts. Everything
 * here is driven by the model's coarse snapshot; every button calls a
 * controller command and never touches the model directly.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { BASE_FT, TOP_FT } from "../model/course";
import CountUp from "./CountUp";
import { accentFor } from "./palette";
import SurfaceContent from "./SurfaceContent";
import { surfaceKindFor } from "./surfaces";

/* The trick on the jump right after a stop (lift runs have none). */
const nextTrickAfter = (course, index) => {
  const run = course.runs[index];
  return run && run.jump ? run.jump.trick : null;
};

const pad = (value, length = 6) => String(value).padStart(length, "0");
const two = (value) => String(value).padStart(2, "0");
const formatNumber = (value) => value.toLocaleString("en-US");

/* Entrance order for staggered card sections. */
const step = (i) => ({ "--i": i });

function Hud({ snapshot, stops, jumps, onSelect }) {
  const lastStop = stops.length - 1;
  const checkpoints = lastStop - 1;
  const nearest = stops[snapshot.nearestStop];
  const where = nearest.kind === "chapter" ? `CP ${nearest.number}/${two(checkpoints)}` : nearest.kind.toUpperCase();
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
  if (snapshot.crash) {
    return (
      <div className="ski-callout ski-callout--crash" key="crash" aria-hidden="true">
        <span className="ski-callout__name">Yard sale!</span>
      </div>
    );
  }
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

/* Full-width stripe that sweeps across the screen on arrival. */
function ArrivalBanner({ snapshot, stops }) {
  const stop = stops[snapshot.activeStop];
  if (!stop || stop.kind !== "chapter") return null;
  return (
    <div className="ski-banner" key={stop.id} style={{ "--accent": accentFor(stop, snapshot.activeStop) }} aria-hidden="true">
      <div className="ski-banner__stripe">
        <span className="ski-banner__kicker">Checkpoint {stop.number}</span>
        <strong className="ski-banner__title">{stop.title}</strong>
      </div>
    </div>
  );
}

function Progress({ index, total }) {
  return (
    <div className="ski-progress ski-in" style={step(1)} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < index ? "is-done" : i === index ? "is-current" : ""} />
      ))}
    </div>
  );
}

function NextButton({ nextTrick, onNext, label, i }) {
  return (
    <button type="button" className="ski-btn ski-btn--primary ski-in" style={step(i)} onClick={onNext}>
      <span className="ski-btn__main">{label ?? "Next run"} ▶</span>
      {nextTrick && <span className="ski-btn__sub">Next jump · {nextTrick.name}</span>}
    </button>
  );
}

function StartCard({ stop, nextTrick, onNext }) {
  const [first, ...rest] = stop.title.split(" ");
  return (
    <>
      <p className="ski-card__kicker ski-in" style={step(0)}>
        <span className="ski-dot" /> Player 1 · Ready
      </p>
      <h1 className="ski-logo ski-in" style={step(1)}>
        <span className="ski-logo__name">
          {first}
          <br />
          {rest.join(" ")}
        </span>
        <span className="ski-logo__sub">Ski the story</span>
      </h1>
      <ul className="ski-card__roles ski-in" style={step(2)}>
        {stop.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="ski-card__body ski-in" style={step(3)}>
        {stop.headline}
      </p>
      <ul className="ski-legend ski-in" style={step(4)} aria-label="Controls">
        <li>
          <kbd>Scroll</kbd> ride
        </li>
        <li>
          <kbd>Space</kbd> next jump
        </li>
        <li>
          <kbd>◆</kbd> warp to chapter
        </li>
      </ul>
      <div className="ski-card__actions">
        <NextButton onNext={onNext} nextTrick={nextTrick} label="Head to the lift" i={5} />
      </div>
    </>
  );
}

function ChapterCard({ stop, index, checkpoints, nextTrick, onNext, onPrev }) {
  return (
    <>
      <header className="ski-card__head ski-in" style={step(0)}>
        <span className="ski-card__num">{stop.number}</span>
        <div className="ski-card__meta">
          <span className="ski-card__kicker">
            Checkpoint {two(index)} / {two(checkpoints)}
          </span>
          <span className="ski-card__era">{stop.era}</span>
        </div>
      </header>
      <Progress index={index - 1} total={checkpoints} />
      <h2 className="ski-card__title ski-in" style={step(2)}>
        {stop.title}
      </h2>
      <p className="ski-card__headline ski-in" style={step(3)}>
        {stop.headline}
      </p>
      {stop.summary && (
        <p className="ski-card__body ski-in" style={step(4)}>
          {stop.summary}
        </p>
      )}
      {stop.stats.length > 0 && (
        <ul className="ski-stats ski-in" style={step(5)}>
          {stop.stats.map((stat, i) => (
            <li key={stat.label}>
              <strong>
                <CountUp value={stat.value} delay={450 + i * 120} />
              </strong>
              <span className="ski-stats__label">{stat.label}</span>
            </li>
          ))}
        </ul>
      )}
      {stop.bullets.length > 0 && (
        <ul className="ski-quests ski-in" style={step(5)}>
          {stop.bullets.map((bullet, i) => (
            <li key={bullet} style={{ "--q": i }}>
              <span className="ski-quests__box" aria-hidden="true" />
              {bullet}
            </li>
          ))}
        </ul>
      )}
      {stop.lesson && (
        <aside className="ski-achievement ski-in" style={step(6)}>
          <span className="ski-achievement__icon" aria-hidden="true">
            ★
          </span>
          <div>
            <span className="ski-achievement__label">Lesson unlocked</span>
            <p>{stop.lesson}</p>
          </div>
        </aside>
      )}
      <div className="ski-card__actions">
        <button
          type="button"
          className="ski-btn ski-btn--ghost ski-in"
          style={step(7)}
          onClick={onPrev}
          aria-label="Back to the previous checkpoint"
        >
          ◀
        </button>
        <NextButton onNext={onNext} nextTrick={nextTrick} i={7} />
      </div>
      <a className="ski-card__more ski-in" style={step(8)} href={stop.href}>
        Read the full chapter →
      </a>
    </>
  );
}

function rankFor(score, best) {
  const ratio = best > 0 ? score / best : 0;
  if (ratio >= 1) return { letter: "S", note: "Perfect run" };
  if (ratio >= 0.75) return { letter: "A", note: "Clean run" };
  if (ratio >= 0.4) return { letter: "B", note: "Solid run" };
  return { letter: "C", note: "Scenic route" };
}

function FinishCard({ stop, snapshot, jumps, onRestart, onPrev }) {
  const best = jumps.reduce((total, jump) => total + jump.trick.points, 0);
  const rank = rankFor(snapshot.score, best);
  return (
    <>
      <p className="ski-card__kicker ski-in" style={step(0)}>
        <span className="ski-dot ski-dot--gold" /> Course complete
      </p>
      <div className="ski-results ski-in" style={step(1)}>
        <div className="ski-rank" aria-label={`Rank ${rank.letter}: ${rank.note}`}>
          <span className="ski-rank__letter">{rank.letter}</span>
          <span className="ski-rank__note">{rank.note}</span>
        </div>
        <dl className="ski-results__stats">
          <div>
            <dt>Final score</dt>
            <dd>
              <CountUp value={snapshot.score} duration={1400} delay={300} format={(n) => pad(n)} />
            </dd>
          </div>
          <div>
            <dt>Tricks landed</dt>
            <dd>
              {snapshot.landedCount}/{jumps.length}
            </dd>
          </div>
          <div>
            <dt>Vertical</dt>
            <dd>{formatNumber(TOP_FT - BASE_FT)}&apos;</dd>
          </div>
        </dl>
      </div>
      <h2 className="ski-card__title ski-in" style={step(2)}>
        Thanks for riding along.
      </h2>
      <p className="ski-card__body ski-in" style={step(3)}>
        {stop.headline}
      </p>
      <div className="ski-links ski-in" style={step(4)}>
        {stop.links.map((link) => (
          <a key={link.label} className="ski-btn ski-btn--small" href={link.href} target="_blank" rel="noreferrer">
            {link.label} ↗
          </a>
        ))}
      </div>
      <div className="ski-card__actions">
        <button
          type="button"
          className="ski-btn ski-btn--ghost ski-in"
          style={step(5)}
          onClick={onPrev}
          aria-label="Back to the previous checkpoint"
        >
          ◀
        </button>
        <button type="button" className="ski-btn ski-btn--primary ski-in" style={step(5)} onClick={onRestart}>
          <span className="ski-btn__main">↻ Ride again</span>
        </button>
      </div>
      <Link className="ski-card__more ski-in" style={step(6)} to="/">
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

function StopCard({ snapshot, activeStop, course, controller }) {
  const { stops, jumps } = course;
  const index = useLingering(activeStop);
  if (index < 0) return null;
  const stop = stops[index];
  const leaving = activeStop !== index;
  const nextTrick = nextTrickAfter(course, index);
  const checkpoints = stops.length - 2;

  return (
    <section
      key={stop.id}
      className={`ski-card ski-card--${stop.kind} ${leaving ? "is-leaving" : ""}`}
      style={{ "--accent": accentFor(stop, index) }}
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
        <FinishCard stop={stop} snapshot={snapshot} jumps={jumps} onRestart={controller.restart} onPrev={controller.prev} />
      )}
    </section>
  );
}

export default function SkiOverlay({ snapshot, course, controller, surfaceMounts = {} }) {
  const { stops, jumps } = course;
  const active = stops[snapshot.activeStop];
  // Stops with a board in the 3D world don't get a floating card or banner.
  const onBoard = Boolean(surfaceMounts[snapshot.activeStop]);
  const cardStop = onBoard ? -1 : snapshot.activeStop;
  return (
    <div className="ski-overlay">
      <Hud snapshot={snapshot} stops={stops} jumps={jumps} onSelect={controller.goTo} />
      <TrickCallout snapshot={snapshot} jumps={jumps} />
      {!onBoard && <ArrivalBanner snapshot={snapshot} stops={stops} />}
      <StopCard snapshot={snapshot} activeStop={cardStop} course={course} controller={controller} />
      {Object.entries(surfaceMounts).map(([key, mount]) => {
        const index = Number(key);
        const stop = stops[index];
        return createPortal(
          <div className="board" style={{ "--accent": accentFor(stop, index) }}>
            <SurfaceContent
              kind={surfaceKindFor(stop)}
              stop={stop}
              index={index}
              active={snapshot.activeStop === index}
              nextTrick={nextTrickAfter(course, index)}
              onNext={controller.next}
              onPrev={controller.prev}
            />
          </div>,
          mount,
          stop.id,
        );
      })}
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
