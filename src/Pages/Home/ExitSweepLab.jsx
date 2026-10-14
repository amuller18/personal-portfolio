import { useMemo, useState } from "react";
import {
  SL_LEVELS,
  STEPS,
  TP_LEVELS,
  backtest,
  generateDataset,
  rankCallers,
  sweep,
} from "../../lib/sim";

const NEUTRAL = [0x38, 0x38, 0x35];
const GAIN = [0x39, 0x87, 0xe5];
const LOSS = [0xe6, 0x67, 0x67];

function mix(from, to, t) {
  const c = from.map((v, i) => Math.round(v + (to[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/* Diverging scale: red for losses, gray at break-even, blue for gains. */
function cellColor(value, maxAbs) {
  const t = Math.min(1, Math.abs(value) / maxAbs);
  return mix(NEUTRAL, value >= 0 ? GAIN : LOSS, t);
}

const pct = (v, digits = 1) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;

const CHART_W = 560;
const CHART_H = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

function TradeChart({ path, tp, sl, handle, index, total }) {
  const [hoverStep, setHoverStep] = useState(null);
  const result = backtest(path, tp, sl);

  const visible = Array.from(path);
  const yMax = Math.max(1 + tp, ...visible) * 1.05;
  const yMin = Math.min(1 - sl, ...visible) * 0.95;
  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;
  const x = (step) => PAD.left + (step / (STEPS - 1)) * innerW;
  const y = (price) => PAD.top + (1 - (price - yMin) / (yMax - yMin)) * innerH;

  const held = visible.slice(0, result.exitAt + 1);
  const after = visible.slice(result.exitAt);
  const line = (points, offset) =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i + offset).toFixed(1)},${y(p).toFixed(1)}`).join(" ");

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = ((e.clientX - box.left) / box.width) * CHART_W;
    const step = Math.round(((ratio - PAD.left) / innerW) * (STEPS - 1));
    setHoverStep(step >= 0 && step < STEPS ? step : null);
  };

  const exitLabel = {
    target: "hit take-profit",
    stop: "stopped out",
    timeout: "closed at window end",
  }[result.reason];

  return (
    <figure className="trade">
      <figcaption className="trade__caption">
        <span>
          {handle} · call {index + 1} of {total}
        </span>
        <span className={result.ret >= 0 ? "pos" : "neg"}>
          {exitLabel} · {pct(result.ret)}
        </span>
      </figcaption>
      <div className="trade__plot">
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          role="img"
          aria-label={`Price path for ${handle} call ${index + 1}: ${exitLabel}, ${pct(result.ret)}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverStep(null)}
        >
          {[1 + tp, 1, 1 - sl].map((level) => (
            <g key={level}>
              <line
                x1={PAD.left}
                x2={CHART_W - PAD.right}
                y1={y(level)}
                y2={y(level)}
                className={level === 1 ? "trade__base" : "trade__level"}
              />
              <text x={PAD.left - 6} y={y(level) + 4} className="trade__tick" textAnchor="end">
                {level === 1 ? "entry" : pct(level - 1, 0)}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={CHART_H - 6} className="trade__tick">
            call
          </text>
          <text x={CHART_W - PAD.right} y={CHART_H - 6} className="trade__tick" textAnchor="end">
            +72h
          </text>
          <path d={line(after, result.exitAt)} className="trade__after" />
          <path d={line(held, 0)} className="trade__held" />
          <circle
            cx={x(result.exitAt)}
            cy={y(result.reason === "timeout" ? path[result.exitAt] : 1 + result.ret)}
            r="5"
            className={`trade__exit ${result.ret >= 0 ? "is-pos" : "is-neg"}`}
          />
          {hoverStep !== null && (
            <g className="trade__hover">
              <line x1={x(hoverStep)} x2={x(hoverStep)} y1={PAD.top} y2={CHART_H - PAD.bottom} />
              <circle cx={x(hoverStep)} cy={y(path[hoverStep])} r="4" />
            </g>
          )}
        </svg>
        {hoverStep !== null && (
          <div
            className="trade__tooltip"
            style={{ left: `${(x(hoverStep) / CHART_W) * 100}%` }}
          >
            <strong>{pct(path[hoverStep] - 1)}</strong>
            <span>hour {hoverStep}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

export default function ExitSweepLab() {
  const dataset = useMemo(() => generateDataset(), []);
  const cells = useMemo(() => sweep(dataset), [dataset]);
  const best = useMemo(() => cells.reduce((a, b) => (b.avg > a.avg ? b : a)), [cells]);
  const maxAbs = useMemo(() => Math.max(...cells.map((c) => Math.abs(c.avg))), [cells]);

  const [selected, setSelected] = useState(best);
  const [hovered, setHovered] = useState(null);
  const [callerHandle, setCallerHandle] = useState(null);
  const [tradeIndex, setTradeIndex] = useState(0);

  const shown = hovered || selected;
  const leaderboard = useMemo(
    () => rankCallers(dataset, selected.tp, selected.sl),
    [dataset, selected]
  );
  const activeHandle = callerHandle || leaderboard[0].handle;
  const caller = dataset.find((c) => c.handle === activeHandle);
  const safeIndex = tradeIndex % caller.paths.length;

  const pickCaller = (handle) => {
    setCallerHandle(handle);
    setTradeIndex(0);
  };

  return (
    <div className="lab">
      <div className="lab__head">
        <div>
          <p className="eyebrow">Try it yourself</p>
          <h3>The exit-strategy sweep, in miniature</h3>
          <p className="muted">
            Every cell replays all {best.trades} calls with one take-profit / stop-loss pair.
            Click a cell to re-rank the callers under that strategy.
          </p>
        </div>
        <span className="badge">Simulated data · not real results</span>
      </div>

      <div className="lab__grid">
        <div className="heat">
          <div className="heat__axis-x">Take-profit →</div>
          <div className="heat__body">
            <div className="heat__axis-y">Stop-loss ↓</div>
            <div className="heat__table">
              <div className="heat__row heat__row--labels">
                <span />
                {TP_LEVELS.map((tp) => (
                  <span key={tp} className="heat__label">
                    +{Math.round(tp * 100)}%
                  </span>
                ))}
              </div>
              {SL_LEVELS.map((sl, row) => (
                <div key={sl} className="heat__row">
                  <span className="heat__label">−{Math.round(sl * 100)}%</span>
                  {cells
                    .filter((c) => c.row === row)
                    .map((cell) => {
                      const isSel = cell.row === selected.row && cell.col === selected.col;
                      const isBest = cell === best;
                      return (
                        <button
                          type="button"
                          key={cell.col}
                          className={`heat__cell ${isSel ? "is-selected" : ""}`}
                          style={{ background: cellColor(cell.avg, maxAbs) }}
                          aria-pressed={isSel}
                          aria-label={`Take-profit ${Math.round(cell.tp * 100)}%, stop-loss ${Math.round(
                            cell.sl * 100
                          )}%: average ${pct(cell.avg)} per trade${isBest ? ", best" : ""}`}
                          onClick={() => setSelected(cell)}
                          onMouseEnter={() => setHovered(cell)}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered(cell)}
                          onBlur={() => setHovered(null)}
                        >
                          {isBest && <span aria-hidden="true">★</span>}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
          <div className="heat__legend">
            <span>{pct(-maxAbs, 0)}</span>
            <div className="heat__ramp" aria-hidden="true" />
            <span>{pct(maxAbs, 0)}</span>
            <span className="muted">avg return / trade · ★ best</span>
          </div>
        </div>

        <div className="lab__side">
          <div className="readout" aria-live="polite">
            <div>
              <span className="readout__k">Strategy</span>
              <span className="readout__v">
                TP +{Math.round(shown.tp * 100)}% / SL −{Math.round(shown.sl * 100)}%
              </span>
            </div>
            <div>
              <span className="readout__k">Avg / trade</span>
              <span className={`readout__v ${shown.avg >= 0 ? "pos" : "neg"}`}>{pct(shown.avg)}</span>
            </div>
            <div>
              <span className="readout__k">Win rate</span>
              <span className="readout__v">{Math.round(shown.winRate * 100)}%</span>
            </div>
          </div>

          <table className="board">
            <caption>Leaderboard under the selected strategy</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Caller</th>
                <th scope="col">Score</th>
                <th scope="col" className="num">Win</th>
                <th scope="col" className="num">Avg</th>
                <th scope="col" className="num">Calls</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row, i) => (
                <tr
                  key={row.handle}
                  className={row.handle === activeHandle ? "is-active" : ""}
                >
                  <td>{i + 1}</td>
                  <td>
                    <button type="button" className="board__caller" onClick={() => pickCaller(row.handle)}>
                      {row.handle}
                    </button>
                  </td>
                  <td>
                    <div className="board__score">
                      <span className="board__bar" style={{ width: `${row.score}%` }} />
                      <span>{row.score}</span>
                    </div>
                  </td>
                  <td className="num">{Math.round(row.winRate * 100)}%</td>
                  <td className={`num ${row.avg >= 0 ? "pos" : "neg"}`}>{pct(row.avg, 0)}</td>
                  <td className="num">{row.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            Score = average percentile across win rate, mean, median, worst trade and profit
            factor, discounted for callers with fewer than 30 calls.
          </p>
        </div>
      </div>

      <div className="lab__trade">
        <TradeChart
          path={caller.paths[safeIndex]}
          tp={selected.tp}
          sl={selected.sl}
          handle={caller.handle}
          index={safeIndex}
          total={caller.paths.length}
        />
        <div className="lab__trade-controls">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setTradeIndex((i) => (i - 1 + caller.paths.length) % caller.paths.length)}
          >
            ← Prev call
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setTradeIndex((i) => (i + 1) % caller.paths.length)}
          >
            Next call →
          </button>
        </div>
      </div>
    </div>
  );
}
