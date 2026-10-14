import { currentWork as now } from "../../data/story";
import { ChapterHeader, Lesson } from "./Chapter";
import Reveal from "./Reveal";

function Connector() {
  return (
    <div className="flow__connector" aria-hidden="true">
      <span />
    </div>
  );
}

/* Sources → one ledger → what the reseller actually sees. */
function Flow() {
  return (
    <figure className="flow">
      <figcaption className="visually-hidden">
        Data from {now.sources.map((s) => s.name).join(", ")} flows into one ledger, which produces{" "}
        {now.outputs.join(", ")}.
      </figcaption>
      <div className="flow__col">
        <span className="flow__label">Pulls from</span>
        {now.sources.map((source, i) => (
          <Reveal key={source.name} className="flow__source" delay={i * 90}>
            <strong>{source.name}</strong>
            <span>{source.detail}</span>
          </Reveal>
        ))}
      </div>
      <Connector />
      <Reveal className="flow__hub" delay={200}>
        <span className="flow__pulse" aria-hidden="true" />
        <strong>{now.hub.name}</strong>
        <span>{now.hub.detail}</span>
      </Reveal>
      <Connector />
      <div className="flow__col">
        <span className="flow__label">So you can see</span>
        {now.outputs.map((output, i) => (
          <Reveal key={output} className="flow__output" delay={300 + i * 90}>
            {output}
          </Reveal>
        ))}
      </div>
    </figure>
  );
}

export default function CurrentWork() {
  return (
    <section id={now.id} className="chapter chapter--now">
      <div className="container">
        <div className="chapter__grid">
          <ChapterHeader {...now} />
          <div className="chapter__body">
            <Reveal>
              <span className="badge badge--live">
                <span className="badge__dot" aria-hidden="true" />
                {now.badge}
              </span>
            </Reveal>
            {now.body.map((paragraph, i) => (
              <Reveal as="p" key={i} delay={i * 80}>
                {paragraph}
              </Reveal>
            ))}
          </div>
        </div>

        <Flow />

        <Lesson>{now.lesson}</Lesson>
      </div>
    </section>
  );
}
