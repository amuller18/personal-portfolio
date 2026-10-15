/*
 * Chapter content painted onto objects in the 3D world. Rendered with React
 * portals into the DOM elements the 3D renderer places in the scene, so each
 * board is real text with working buttons and links.
 *
 * Layouts are in board pixels (1000 tall; width follows the viewport's
 * shape) and switch to a stacked layout on portrait screens.
 */
import CountUp from "./CountUp";

const two = (value) => String(value).padStart(2, "0");
const LEVEL_SYMBOL = { green: "●", blue: "■", black: "◆" };

function Actions({ onPrev, onNext, label, sub, href }) {
  return (
    <footer className="board-actions">
      <button type="button" className="ski-btn ski-btn--ghost" onClick={onPrev} aria-label="Back to the previous checkpoint">
        ◀
      </button>
      <button type="button" className="ski-btn ski-btn--primary" onClick={onNext}>
        <span className="ski-btn__main">{label} ▶</span>
        {sub && <span className="ski-btn__sub">{sub}</span>}
      </button>
      <a className="board-more" href={href}>
        Read the full chapter →
      </a>
    </footer>
  );
}

/* Chapter one: painted on the side of the chairlift station. */
function StationWall({ stop, index, active, onNext, onPrev }) {
  return (
    <article className="sw" aria-label={`Chapter ${stop.number}: ${stop.title}`}>
      <header className="sw__band">
        <span className="sw__chair">Chair {two(index)}</span>
        <span className="sw__name">{stop.ski.liftName || stop.title}</span>
        <span className="sw__status">
          <i aria-hidden="true" /> Open
        </span>
      </header>
      <div className="sw__body">
        <div className="sw__lead">
          <p className="sw__era">
            Checkpoint {stop.number} · {stop.era}
          </p>
          <h2 className="sw__title">{stop.title}</h2>
          <p className="sw__headline">{stop.headline}</p>
          <p className="sw__summary">{stop.summary}</p>
        </div>
        <aside className="sw__info">
          <h3 className="sw__infohead">Lift info</h3>
          <dl className="sw__stats">
            {stop.stats.map((stat, i) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>
                  <CountUp key={active ? "on" : "off"} value={stat.value} delay={300 + i * 150} />
                </dd>
              </div>
            ))}
          </dl>
          {stop.lesson && (
            <div className="sw__rule">
              <span className="sw__diamond" aria-hidden="true">
                <b>!</b>
              </span>
              <div>
                <strong>Mountain rule</strong>
                <p>{stop.lesson}</p>
              </div>
            </div>
          )}
        </aside>
      </div>
      <Actions onPrev={onPrev} onNext={onNext} label="Board the lift" sub="Ride up to the trail map" href={stop.href} />
    </article>
  );
}

/* Five runs fanning down from the summit; pathLength=1 lets CSS draw them in. */
const TRAIL_PATHS = [
  "M418 122 C 300 180, 250 260, 230 330 S 190 470, 150 548",
  "M424 126 C 380 220, 360 300, 330 380 S 300 500, 288 552",
  "M432 126 C 470 230, 452 320, 432 400 S 420 500, 432 552",
  "M440 122 C 530 190, 562 270, 562 340 S 582 470, 604 548",
  "M450 124 C 620 170, 680 260, 690 340 S 702 470, 722 548",
];
const LABEL_AT = [
  [70, 300],
  [150, 438],
  [452, 286],
  [520, 432],
  [600, 214],
];

function TrailSvg({ trails }) {
  return (
    <svg className="tm-svg" viewBox="0 0 800 600" role="img" aria-label="Trail map: the Wisepal pipeline drawn as ski runs">
      <defs>
        <linearGradient id="tm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe0ff" />
          <stop offset="1" stopColor="#eef6ff" />
        </linearGradient>
        <linearGradient id="tm-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dde8f8" />
        </linearGradient>
      </defs>
      <rect width="800" height="600" fill="url(#tm-sky)" />
      <path d="M0 330 L120 200 L210 270 L320 150 L420 90 L520 160 L640 120 L800 260 L800 600 L0 600 Z" fill="#9db4e4" />
      <path d="M0 400 L150 250 L270 320 L418 104 L560 230 L680 190 L800 330 L800 600 L0 600 Z" fill="url(#tm-snow)" />
      <path d="M418 104 L470 180 L440 260 L520 330 L470 420 L540 600 L418 600 Z" fill="#cfdcf3" opacity="0.7" />
      <path d="M418 104 L380 200 L300 260 L330 360 L250 470 L240 600 L180 600 L200 430 Z" fill="#e4ecfa" opacity="0.8" />
      {Array.from({ length: 46 }, (_, i) => {
        const x = 40 + ((i * 137) % 730);
        const y = 300 + ((i * 89) % 270);
        const nearTrail = TRAIL_PATHS.some((_, t) => Math.abs(x - (150 + t * 143)) < 26 && y > 470);
        if (nearTrail) return null;
        return <path key={i} d={`M${x} ${y - 16} l9 16 h-18 z`} fill="#2f6f57" />;
      })}
      <path className="tm-lift" d="M378 566 L412 132" />
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <circle key={t} cx={378 + (412 - 378) * t} cy={566 + (132 - 566) * t} r="4" fill="#0b1030" />
      ))}
      {trails.map((trail, i) => (
        <g key={trail.name} className={`tm-trail tm-trail--${trail.level}`} style={{ "--t": i }}>
          <path className="tm-trail__halo" d={TRAIL_PATHS[i]} pathLength="1" />
          <path className="tm-trail__line" d={TRAIL_PATHS[i]} pathLength="1" />
        </g>
      ))}
      {trails.map((trail, i) => {
        const [x, y] = LABEL_AT[i];
        const width = trail.name.length * 9.4 + 48;
        return (
          <g key={trail.name} className="tm-label" style={{ "--t": i }} transform={`translate(${x} ${y})`}>
            <rect width={width} height="32" rx="16" />
            <text x="16" y="21" className={`tm-label__sym tm-label__sym--${trail.level}`}>
              {LEVEL_SYMBOL[trail.level]}
            </text>
            <text x="34" y="21">
              {trail.name}
            </text>
          </g>
        );
      })}
      <g className="tm-here" transform="translate(418 100)">
        <circle className="tm-here__pulse" r="22" />
        <path d="M0 -15 L4.4 -4.6 L15 -4.6 L6.6 2.2 L9.6 13 L0 6.6 L-9.6 13 L-6.6 2.2 L-15 -4.6 L-4.4 -4.6 Z" />
        <text x="24" y="-12">
          You are here
        </text>
      </g>
    </svg>
  );
}

/* Chapter two: the trail map posted at the top of the lift. */
function TrailMap({ stop, nextTrick, onNext, onPrev }) {
  const trails = stop.ski.trails || [];
  return (
    <article className="tm" aria-label={`Chapter ${stop.number}: ${stop.title}`}>
      <header className="tm__head">
        <div>
          <span className="tm__resort">{stop.ski.mapName || stop.title}</span>
          <span className="tm__sub">Summit trail map · Checkpoint {stop.number}</span>
        </div>
        <span className="tm__compass" aria-hidden="true">
          N
        </span>
      </header>
      <div className="tm__body">
        <figure className="tm__map">
          <TrailSvg trails={trails} />
          <figcaption className="tm__key">
            {trails.map((trail, i) => (
              <span key={trail.name}>
                <b className={`tm-key--${trail.level}`}>{LEVEL_SYMBOL[trail.level]}</b>
                {i + 1}. {trail.note}
              </span>
            ))}
          </figcaption>
        </figure>
        <section className="tm__legend">
          <p className="tm__era">{stop.era}</p>
          <h2 className="tm__title">{stop.title}</h2>
          <p className="tm__headline">{stop.headline}</p>
          <p className="tm__summary">{stop.summary}</p>
          <ul className="tm__stats">
            {stop.stats.map((stat) => (
              <li key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </li>
            ))}
          </ul>
          {stop.lesson && (
            <p className="tm__tip">
              <span>★ Trail tip</span>
              {stop.lesson}
            </p>
          )}
        </section>
      </div>
      <Actions
        onPrev={onPrev}
        onNext={onNext}
        label="Drop in"
        sub={nextTrick ? `Next jump · ${nextTrick.name}` : null}
        href={stop.href}
      />
    </article>
  );
}

const BOARDS = { station: StationWall, trailMap: TrailMap };

export default function SurfaceContent({ kind, ...props }) {
  const Board = BOARDS[kind];
  return Board ? <Board {...props} /> : null;
}
