import { profile, sideQuests, storyOrder, toolkit } from "../../data/story";
import Reveal from "./Reveal";

const UNWRITTEN = String(storyOrder.length + 1).padStart(2, "0");

export function SideQuests() {
  return (
    <section id="projects" className="section">
      <div className="container">
        <Reveal as="h2" className="section__title">
          Side quests
        </Reveal>
        <div className="quests">
          {sideQuests.map((quest, i) => (
            <Reveal key={quest.title} delay={i * 90}>
              <a className="quest" href={quest.href} target="_blank" rel="noreferrer">
                <div className="quest__img">
                  <img src={quest.img} alt="" loading="lazy" />
                </div>
                <div className="quest__body">
                  <h3>{quest.title}</h3>
                  <p>{quest.body}</p>
                  <span className="text-link">{quest.cta} ↗</span>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Toolkit() {
  return (
    <section id="toolkit" className="section">
      <div className="container">
        <Reveal as="h2" className="section__title">
          The toolkit
        </Reveal>
        <div className="toolkit">
          {toolkit.map((group, i) => (
            <Reveal key={group.group} className="toolkit__group" delay={i * 70}>
              <h3>{group.group}</h3>
              <ul>
                {group.items.map((item, j) => (
                  <li key={item} style={{ "--i": j }}>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Contact() {
  return (
    <footer id="contact" className="contact">
      <div className="container">
        <Reveal as="p" className="eyebrow">
          Chapter {UNWRITTEN} is unwritten
        </Reveal>
        <Reveal as="h2" className="contact__title" delay={80}>
          Let&apos;s write it <span className="shimmer">together.</span>
        </Reveal>
        <Reveal as="p" className="contact__blurb" delay={160}>
          Building in AI, data, or finance? I&apos;d love to hear about it.
        </Reveal>
        <Reveal className="contact__links" delay={240}>
          <a className="btn btn--primary" href={`mailto:${profile.email}`}>
            {profile.email}
          </a>
          <a className="btn btn--ghost" href={profile.linkedin} target="_blank" rel="noreferrer">
            LinkedIn
          </a>
          <a className="btn btn--ghost" href={profile.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </Reveal>
        <p className="contact__fine">
          © {new Date().getFullYear()} {profile.name} · {profile.location}
        </p>
      </div>
    </footer>
  );
}
