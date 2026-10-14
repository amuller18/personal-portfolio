/*
 * A toy, fully synthetic re-creation of the TraderRanker workflow:
 * generate "calls" from fictional callers, run a uniform backtest under a
 * grid of exit strategies, then score each caller. Nothing here is real data.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const STEPS = 72;

export const CALLERS = [
  { handle: "@quiet_whale", edge: 0.55, noise: 0.25, vol: 0.02, calls: 38 },
  { handle: "@chart_wizard", edge: 0.45, noise: 0.3, vol: 0.025, calls: 46 },
  { handle: "@steady_sam", edge: 0.3, noise: 0.12, vol: 0.015, calls: 52 },
  { handle: "@100x_hunter", edge: 0.5, noise: 0.5, vol: 0.035, calls: 31 },
  { handle: "@pump_prophet", edge: 0.15, noise: 0.35, vol: 0.03, calls: 64 },
  { handle: "@degen_oracle", edge: 0.05, noise: 0.3, vol: 0.03, calls: 12 },
];

export const TP_LEVELS = [0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2.5];
export const SL_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9];

/*
 * Each call is a price path normalised to 1.0 at entry. The shape is the
 * classic post-call pattern: an early shakeout dip, a pump whose size depends
 * on the caller's edge, then a slow bleed. That is why exit strategy matters.
 */
function generatePath(rand, caller) {
  const impulse = caller.edge + caller.noise * gaussian(rand);
  const dip = 0.1 + rand() * 0.2;
  const tau = 6 + rand() * 10;
  const fade = 0.004 + rand() * 0.006;
  const path = new Float64Array(STEPS);
  let noise = 0;
  path[0] = 1;
  for (let t = 1; t < STEPS; t += 1) {
    noise += caller.vol * gaussian(rand);
    const shakeout = -dip * Math.exp(-(((t - 3) / 2) ** 2));
    const pump = impulse * (1 - Math.exp(-t / tau));
    path[t] = Math.exp(shakeout + pump - fade * t + noise);
  }
  return path;
}

export function generateDataset(seed = 18) {
  const rand = mulberry32(seed);
  return CALLERS.map((caller) => ({
    ...caller,
    paths: Array.from({ length: caller.calls }, () => generatePath(rand, caller)),
  }));
}

/* Uniform backtest: enter at the call, exit on TP, SL, or end of window. */
export function backtest(path, tp, sl) {
  for (let t = 1; t < path.length; t += 1) {
    if (path[t] <= 1 - sl) return { ret: -sl, exitAt: t, reason: "stop" };
    if (path[t] >= 1 + tp) return { ret: tp, exitAt: t, reason: "target" };
  }
  const last = path.length - 1;
  return { ret: path[last] - 1, exitAt: last, reason: "timeout" };
}

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function sweep(dataset) {
  const cells = [];
  SL_LEVELS.forEach((sl, row) => {
    TP_LEVELS.forEach((tp, col) => {
      const returns = dataset.flatMap((caller) =>
        caller.paths.map((path) => backtest(path, tp, sl).ret),
      );
      cells.push({
        row,
        col,
        tp,
        sl,
        avg: mean(returns),
        winRate: returns.filter((r) => r > 0).length / returns.length,
        trades: returns.length,
      });
    });
  });
  return cells;
}

function percentileRanks(values, higherIsBetter = true) {
  return values.map((v) => {
    const beaten = values.filter((other) => (higherIsBetter ? other < v : other > v)).length;
    return values.length > 1 ? beaten / (values.length - 1) : 1;
  });
}

/*
 * Aggregate score: average percentile rank across several metrics, discounted
 * when a caller has too few calls to trust.
 */
export function rankCallers(dataset, tp, sl, minSample = 30) {
  const rows = dataset.map((caller) => {
    const returns = caller.paths.map((path) => backtest(path, tp, sl).ret);
    const wins = returns.filter((r) => r > 0);
    const losses = returns.filter((r) => r <= 0);
    const grossLoss = Math.abs(losses.reduce((s, r) => s + r, 0));
    const grossWin = wins.reduce((s, r) => s + r, 0);
    return {
      handle: caller.handle,
      calls: returns.length,
      winRate: wins.length / returns.length,
      avg: mean(returns),
      median: median(returns),
      worst: Math.min(...returns),
      profitFactor: grossLoss === 0 ? grossWin : grossWin / grossLoss,
    };
  });

  const metricRanks = [
    percentileRanks(rows.map((r) => r.winRate)),
    percentileRanks(rows.map((r) => r.avg)),
    percentileRanks(rows.map((r) => r.median)),
    percentileRanks(rows.map((r) => r.worst)),
    percentileRanks(rows.map((r) => r.profitFactor)),
  ];

  return rows
    .map((row, i) => {
      const raw = mean(metricRanks.map((ranks) => ranks[i]));
      const confidence = Math.min(1, row.calls / minSample);
      return { ...row, score: Math.round(raw * confidence * 100) };
    })
    .sort((a, b) => b.score - a.score);
}
