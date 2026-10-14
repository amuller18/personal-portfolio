import { CheckoutRace, ClusterDoodle, CountUp, SmsDoodle } from "./Doodles";
import Reveal from "./Reveal";

/* Animated doodles for chapters that use the standard layout. */
const DOODLES = {
  hustle: CheckoutRace,
  telaviv: ClusterDoodle,
  tutormatch: SmsDoodle,
};

export function ChapterHeader({ number, era, title, headline, doodle }) {
  return (
    <header className="chapter__header">
      <Reveal className="chapter__tag">
        <span className="chapter__num">Chapter {number}</span>
        <span className="chapter__era">{era}</span>
      </Reveal>
      <Reveal as="h2" className="chapter__title" delay={80}>
        {title}
      </Reveal>
      <Reveal as="p" className="chapter__headline" delay={160}>
        {headline}
      </Reveal>
      {doodle && (
        <Reveal className="chapter__doodle" delay={240}>
          {doodle}
        </Reveal>
      )}
    </header>
  );
}

export function Lesson({ children }) {
  return (
    <Reveal as="blockquote" className="lesson">
      <span className="lesson__label">Lesson learned</span>
      <p>{children}</p>
    </Reveal>
  );
}

export default function Chapter({ chapter }) {
  const Doodle = DOODLES[chapter.id];
  return (
    <section id={chapter.id} className="chapter">
      <div className="container chapter__grid">
        <ChapterHeader {...chapter} doodle={Doodle && <Doodle />} />
        <div className="chapter__body">
          {chapter.body.map((paragraph, i) => (
            <Reveal as="p" key={i} delay={i * 80}>
              {paragraph}
            </Reveal>
          ))}
          <Reveal className="stat-row" delay={160}>
            {chapter.stats.map((stat) => (
              <div key={stat.label} className="stat">
                <CountUp value={stat.value} />
                <span className="stat__label">{stat.label}</span>
              </div>
            ))}
          </Reveal>
          {chapter.link && (
            <Reveal delay={200}>
              <a className="text-link" href={chapter.link.href} target="_blank" rel="noreferrer">
                {chapter.link.label} →
              </a>
            </Reveal>
          )}
          <Lesson>{chapter.lesson}</Lesson>
        </div>
      </div>
    </section>
  );
}
