import type { WheelNode } from "./types";

export type TourPhase = "wide" | "drill" | "pullback";

export interface TourStep {
  phase: TourPhase;
  durationMs: number;
  nodeId?: string;
}

export const WIDE_MS = 8_000;
// 45s, not 18s. The quiz funnel behind each drilled lead needs real time to
// run to an outcome (see components/lattice/QuizCard.tsx's FUNNEL_OPTS
// comment) — measured directly against the funnel route, a cold run takes
// ~50s even sped up. Combined with the ~8s a lead's iframe already spent
// preloading during the previous wide beat, 45s of visible drill gives a
// real conversion room to land before the wheel moves on.
export const DRILL_MS = 45_000;
export const PULLBACK_MS = 2_500;
export const DRILLS_PER_CYCLE = 3;

// Small deterministic hash so a seed maps to a stable pick without pulling in
// a stateful RNG. Recording runs must be reproducible.
function hash(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Pick one lead from each of `count` distinct rep zones, so consecutive
 * drills visibly move around the wheel instead of staying in one fan.
 */
export function selectDrillNodes(
  leads: WheelNode[],
  seed: number,
  count: number = DRILLS_PER_CYCLE,
): WheelNode[] {
  const byZone = new Map<number, WheelNode[]>();
  for (const lead of leads) {
    const zone = lead.zoneIndex ?? 0;
    const bucket = byZone.get(zone);
    if (bucket) bucket.push(lead);
    else byZone.set(zone, [lead]);
  }

  const zones = [...byZone.keys()].sort((a, b) => a - b);
  const rotated = zones
    .map((zone, index) => ({ zone, rank: hash(seed, index) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count)
    .map((entry) => entry.zone);

  return rotated.map((zone, index) => {
    const bucket = byZone.get(zone)!;
    return bucket[Math.floor(hash(seed, 100 + index) * bucket.length)]!;
  });
}

/**
 * One full loop: open on the whole wheel, then drill into each chosen lead
 * and pull back out. Wide-to-tight, roughly 150 seconds — each drill runs
 * long enough for its lead's funnel to reach a real outcome (see DRILL_MS).
 */
export function buildTourCycle(drillNodes: WheelNode[]): TourStep[] {
  const steps: TourStep[] = [{ phase: "wide", durationMs: WIDE_MS }];
  for (const node of drillNodes) {
    steps.push({ phase: "drill", durationMs: DRILL_MS, nodeId: node.id });
    steps.push({ phase: "pullback", durationMs: PULLBACK_MS });
  }
  return steps;
}
