import { useEffect, useMemo, useState } from "react";
import { hero, profile } from "../../data/story";
import { mulberry32 } from "../../lib/sim";
import { usePrefersReducedMotion } from "../../hooks/useInView";

const WIDTH = 800;
const HEIGHT = 400;
const POINTS = 90;

/* Many faint random walks (the noise) and one rising line (the signal). */
function buildLines() {
  const rand = mulberry32(7);
  const toPath = (values) =>
    values
      .map((v, i) => {
        const x = (i / (POINTS - 1)) * WIDTH;
        const y = HEIGHT / 2 - v;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const noise = Array.from({ length: 14 }, () => {
    let v = (rand() - 0.5) * 60;
    return toPath(
      Array.from({ length: POINTS }, () => {
        v += (rand() - 0.5) * 22;
        v = Math.max(-170, Math.min(170, v));
        return v;
      }),
    );
  });

  let s = -60;
  const signal = toPath(
    Array.from({ length: POINTS }, (_, i) => {
      s += 2.4 + (rand() - 0.5) * 10;
      return Math.min(150, s + Math.sin(i / 6) * 6);
    }),
  );
  return { noise, signal };
}

export default function HeroSection() {
  const { noise, signal } = useMemo(buildLines, []);
  const reduced = usePrefersReducedMotion();
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    if (reduced) return undefined;
    const id = window.setInterval(() => setWordIndex((i) => (i + 1) % hero.rotating.length), 2400);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <section id="top" className="hero">
      <svg
        className="hero__chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {noise.map((d, i) => (
          <path key={i} d={d} className="hero__noise" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
        <path d={signal} className="hero__signal" pathLength="1" />
      </svg>

      <div className="hero__inner">
        <div className="hero__copy">
          <p className="eyebrow">{hero.kicker}</p>
          <h1 className="hero__title">
            {hero.lead}{" "}
            <span className="hero__rotator" aria-live="polite">
              <span key={wordIndex} className="hero__word">
                {hero.rotating[wordIndex]}
              </span>
            </span>
            <br />
            {hero.tail}
          </h1>
          <p className="hero__blurb">{hero.blurb}</p>
          <div className="hero__meta">
            <span>{profile.role}</span>
            <span>{profile.school}</span>
            <span>{profile.offline}</span>
          </div>
          <div className="hero__ctas">
            <a className="btn btn--primary" href="#hustle">
              Read the story
            </a>
            <a className="btn btn--ghost" href="#traderranker">
              Skip to TraderRanker
            </a>
          </div>
        </div>
        <div className="hero__portrait">
          <img src="./img/hero_img.png" alt="Alex Muller" />
        </div>
      </div>

      <a href="#hustle" className="hero__scroll" aria-label="Scroll to the story">
        <span />
      </a>
    </section>
  );
}
