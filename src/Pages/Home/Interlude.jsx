import { useMemo } from "react";
import { interlude } from "../../data/story";
import { mulberry32 } from "../../lib/sim";
import { ChapterHeader, Lesson } from "./Chapter";
import Reveal from "./Reveal";

const WIDTH = 1200;
const HEIGHT = 260;

/* Layered mountain ridgelines, drawn the same way as the hero's price lines. */
function buildRidges() {
  const rand = mulberry32(2028);
  return [0.35, 0.55, 0.75].map((base, layer) => {
    const points = 48;
    let v = 0;
    const coords = Array.from({ length: points }, (_, i) => {
      v += (rand() - 0.5) * (60 - layer * 14);
      v *= 0.9;
      const peak = Math.sin((i / (points - 1)) * Math.PI * (1.5 + layer)) * (70 - layer * 18);
      const x = (i / (points - 1)) * WIDTH;
      const y = HEIGHT * base - peak - v;
      return `${x.toFixed(1)},${Math.max(8, y).toFixed(1)}`;
    });
    return `M0,${HEIGHT} L${coords.join(" L")} L${WIDTH},${HEIGHT} Z`;
  });
}

const ICONS = {
  ski: "M4 20 20 4M7 21l3-3M14 14l3 3M5 11l3 3",
  climb: "M7 21 11 3h2l4 18M8 14h8M9 9h6",
  hike: "M3 20 9 9l4 6 3-4 5 9z",
  friends:
    "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3 3-5 6-5s6 2 6 5M12 15.5c1-.3 2.2-.5 4-.5 3 0 6 2 6 5",
  travel:
    "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  new: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
};

export default function Interlude() {
  const ridges = useMemo(buildRidges, []);

  return (
    <section id={interlude.id} className="chapter interlude">
      <svg
        className="interlude__ridges"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {ridges.map((d, i) => (
          <path key={i} d={d} className={`interlude__ridge interlude__ridge--${i}`} />
        ))}
      </svg>
      <div className="container">
        <div className="interlude__grid">
          <Reveal as="figure" className="polaroid">
            <img
              src={interlude.photo.src}
              alt={interlude.photo.alt}
              width="900"
              height="1200"
              loading="lazy"
            />
            <figcaption>{interlude.photo.caption}</figcaption>
          </Reveal>
          <div className="interlude__text">
            <ChapterHeader {...interlude} />
            <div className="chapter__body">
              {interlude.body.map((paragraph, i) => (
                <Reveal as="p" key={i} delay={i * 80}>
                  {paragraph}
                </Reveal>
              ))}
            </div>
          </div>
        </div>

        <ul className="activities">
          {interlude.activities.map((item, i) => (
            <Reveal as="li" key={item.key} className="activity" delay={i * 70}>
              <svg
                className="activity__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={ICONS[item.key]} />
              </svg>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </Reveal>
          ))}
        </ul>

        <Lesson>{interlude.lesson}</Lesson>
      </div>
    </section>
  );
}
