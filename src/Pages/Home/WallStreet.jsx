import { wallStreet as ws } from "../../data/story";
import { ChapterHeader, Lesson } from "./Chapter";
import { CountUp, PipelineRun } from "./Doodles";
import Reveal from "./Reveal";

export default function WallStreet() {
  return (
    <section id={ws.id} className="chapter">
      <div className="container">
        <div className="chapter__grid">
          <ChapterHeader {...ws} doodle={<PipelineRun />} />
          <div className="chapter__body">
            <Reveal as="p">{ws.intro}</Reveal>
            <Reveal className="stat-row" delay={120}>
              {ws.stats.map((stat) => (
                <div key={stat.label} className="stat">
                  <CountUp value={stat.value} />
                  <span className="stat__label">{stat.label}</span>
                </div>
              ))}
            </Reveal>
          </div>
        </div>

        <div className="work-grid">
          {ws.work.map((item, i) => (
            <Reveal key={item.title} className="work-card" delay={i * 90}>
              <span className="work-card__tag">{item.tag}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </Reveal>
          ))}
        </div>

        <Lesson>{ws.lesson}</Lesson>
      </div>
    </section>
  );
}
