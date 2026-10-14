import { nextChapter as next } from "../../data/story";
import { ChapterHeader } from "./Chapter";
import Reveal from "./Reveal";

export default function NextChapter() {
  return (
    <section id={next.id} className="chapter chapter--next">
      <div className="container">
        <div className="chapter__grid">
          <ChapterHeader {...next} />
          <div className="chapter__body">
            <Reveal as="p">{next.body}</Reveal>
          </div>
        </div>
        <ol className="goals">
          {next.goals.map((goal, i) => (
            <Reveal as="li" key={goal.title} className="goal" delay={i * 90}>
              <span className="goal__num">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3>{goal.title}</h3>
                <p>{goal.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
