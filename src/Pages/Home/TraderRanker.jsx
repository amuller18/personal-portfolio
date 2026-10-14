import { useState } from "react";
import { traderRanker as tr } from "../../data/story";
import { ChapterHeader, Lesson } from "./Chapter";
import CopyTraderTerminal from "./CopyTraderTerminal";
import ExitSweepLab from "./ExitSweepLab";
import Reveal from "./Reveal";

function Pipeline() {
  const [active, setActive] = useState(0);
  const stage = tr.pipeline[active];

  return (
    <div className="pipeline">
      <ol className="pipeline__track" role="tablist" aria-label="TraderRanker pipeline stages">
        {tr.pipeline.map((step, i) => (
          <li key={step.key} className={i <= active ? "is-done" : ""}>
            <button
              type="button"
              role="tab"
              id={`stage-${step.key}`}
              aria-selected={i === active}
              aria-controls="pipeline-panel"
              className={i === active ? "is-active" : ""}
              onClick={() => setActive(i)}
            >
              <span className="pipeline__dot">{i + 1}</span>
              <span className="pipeline__short">{step.short}</span>
            </button>
          </li>
        ))}
      </ol>
      <div
        id="pipeline-panel"
        role="tabpanel"
        aria-labelledby={`stage-${stage.key}`}
        className="pipeline__panel"
        key={stage.key}
      >
        <span className="pipeline__step">
          Stage {active + 1} / {tr.pipeline.length}
        </span>
        <h4>{stage.title}</h4>
        <p>{stage.body}</p>
        <div className="pipeline__nav">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={active === 0}
            onClick={() => setActive((i) => i - 1)}
          >
            ← Back
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={active === tr.pipeline.length - 1}
            onClick={() => setActive((i) => i + 1)}
          >
            Next stage →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TraderRanker() {
  return (
    <section id={tr.id} className="chapter chapter--feature">
      <div className="container">
        <div className="chapter__grid">
          <ChapterHeader {...tr} />
          <div className="chapter__body">
            {tr.intro.map((paragraph, i) => (
              <Reveal as="p" key={i} delay={i * 80}>
                {paragraph}
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal className="constraint">
          <h3>{tr.constraint.title}</h3>
          <p>{tr.constraint.body}</p>
        </Reveal>

        <div className="versus">
          {[tr.etl, tr.elt].map((side, i) => (
            <Reveal
              key={side.label}
              delay={i * 120}
              className={`versus__card ${i === 1 ? "versus__card--win" : ""}`}
            >
              <span className="versus__label">{side.label}</span>
              <ol>
                {side.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <h3 className="sub-heading">How it works, end to end</h3>
          <Pipeline />
        </Reveal>

        <Reveal>
          <ExitSweepLab />
        </Reveal>

        <div className="closing-loop">
          <Reveal className="closing-loop__text">
            <p className="eyebrow">Closing the loop</p>
            <h3>Then I let the rankings trade.</h3>
            <p>
              Research is only worth something if you act on it. The on-chain copy trader watches
              for new calls, checks the caller&apos;s score, and executes with the exit strategy the
              sweep picked, with no human in the loop.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <CopyTraderTerminal />
          </Reveal>
        </div>

        <Lesson>{tr.lesson}</Lesson>
      </div>
    </section>
  );
}
