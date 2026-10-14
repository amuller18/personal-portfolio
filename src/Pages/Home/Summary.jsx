import { useSite } from "../../context/SiteContext";
import { profile, summary } from "../../data/story";
import { CountUp } from "./Doodles";
import Reveal from "./Reveal";

/* The 30-second version: everything a busy reader needs on one screen. */
export default function Summary() {
  const { setMode } = useSite();

  return (
    <main id="top" className="summary">
      <div className="container">
        <Reveal as="p" className="eyebrow">
          The 30-second version
        </Reveal>
        <Reveal as="h1" className="summary__title" delay={60}>
          {profile.name}
        </Reveal>
        <Reveal as="p" className="summary__lead" delay={120}>
          {summary.headline}
        </Reveal>
        <Reveal className="hero__meta" delay={160}>
          <span>{profile.role}</span>
          <span>{profile.school}</span>
          <span>{profile.location}</span>
        </Reveal>

        <Reveal className="stat-row summary__stats" delay={200}>
          {summary.stats.map((stat) => (
            <div key={stat.label} className="stat">
              <CountUp value={stat.value} />
              <span className="stat__label">{stat.label}</span>
            </div>
          ))}
        </Reveal>

        <div className="summary__grid">
          {summary.highlights.map((item, i) => (
            <Reveal key={item.title} className="work-card" delay={240 + i * 70}>
              <span className="work-card__tag">{item.tag}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="summary__skills" delay={200}>
          {summary.skills.map((skill) => (
            <span key={skill}>{skill}</span>
          ))}
        </Reveal>

        <Reveal className="summary__ctas" delay={240}>
          <a className="btn btn--primary" href={`mailto:${profile.email}`}>
            {profile.email}
          </a>
          <a className="btn btn--ghost" href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <a className="btn btn--ghost" href={profile.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <button type="button" className="btn btn--ghost" onClick={() => setMode("story")}>
            Read the full story →
          </button>
        </Reveal>
      </div>
    </main>
  );
}
