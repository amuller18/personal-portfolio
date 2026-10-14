/* Colors shared by every ski view so gates, cards and banners always match. */
export const GATE_COLORS = ["#ff4d4d", "#2bd9a0", "#ffd23f", "#5ef0ff", "#c77dff", "#ff8a3d"];

export function accentFor(stop, index) {
  if (stop.kind === "start") return "#ff4d4d";
  if (stop.kind === "finish") return "#ffd23f";
  return GATE_COLORS[index % GATE_COLORS.length];
}
