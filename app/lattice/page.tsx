'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScoreboardRail } from '@/components/rail/ScoreboardRail';
import { QuizCard } from '@/components/lattice/QuizCard';
import { useTourDriver } from '@/components/lattice/useTourDriver';
import {
  BASE_CALLS,
  BASE_PURCHASES,
  BASE_REVENUE,
  STAGE_H,
  STAGE_W,
  UPSELL_PCT,
  useFitStage,
  useLiveTally,
  useRealTileOutcomes,
  useRecordingChrome,
  type FeedEvent,
} from '@/lib/adStage';
import type { VisualizerApp } from '@/lib/lattice/createVisualizerApp';
import { buildLeadIdentities } from '@/lib/lattice/leads';

const LatticeCanvas = dynamic(
  () => import('@/components/lattice/LatticeCanvas').then((m) => m.LatticeCanvas),
  { ssr: false },
);

const PAD = 40;
// 360, not 300. The three stat tiles (PURCHASES / CALLS / UPSELL %) have an
// intrinsic minimum width of 346px together, measured in the browser. At 300
// they overflowed the rail by 46px and the wheel column's background painted
// over the spill, slicing the UPSELL % tile vertically.
//
// Widening the rail is free here: WHEEL_W becomes 1440, and the wheel radius
// is 0.42 * min(WHEEL_W, WHEEL_H) with WHEEL_H = 1000, so the wheel stays
// height-constrained at 420px and does not change size.
const RAIL_W = 360;
const COL_GAP = 40;

// The wheel column's own size. The stage is a fixed 1920x1080 with fixed
// padding, so this is a constant rather than something to measure. Card
// placement works in this space, because getFocusScreenPosition() returns
// canvas-relative coordinates and the canvas fills this column.
const WHEEL_W = STAGE_W - PAD * 2 - RAIL_W - COL_GAP; // 1500
const WHEEL_H = STAGE_H - PAD * 2; // 1000
const CARD_MARGIN = 16;

// Ambient feed lead numbers must not collide with real lead numbers.
// Real leads are Lead 101..196 (see lib/lattice/leads.ts). useLiveTally
// otherwise defaults its numbering to basePurchases + baseCalls + 80, which
// lands at 160 and climbs straight through the real range — the rail would
// report "Lead 160 bought" for a synthetic event while the wheel drills a
// genuinely different Lead 160.
const AMBIENT_FIRST_LEAD_NO = 200;

export default function LatticePage() {
  const fit = useFitStage();
  useRecordingChrome('#eef1f5');
  const { tally, feed } = useLiveTally({
    baseRevenue: BASE_REVENUE,
    basePurchases: BASE_PURCHASES,
    baseCalls: BASE_CALLS,
    feedStartLeadNo: AMBIENT_FIRST_LEAD_NO,
  });

  const [app, setApp] = useState<VisualizerApp | null>(null);
  const handleReady = useCallback((ready: VisualizerApp) => setApp(ready), []);

  const tour = useTourDriver(app);
  const outcomes = useRealTileOutcomes();
  const identities = useMemo(() => buildLeadIdentities(), []);

  // COORDINATE SPACE — the single easiest thing to get wrong here.
  //
  // `getFocusScreenPosition()` returns CANVAS-relative coordinates (0..canvas
  // width, 0..canvas height), and QuizCard is absolutely positioned inside the
  // wheel <section>, which the canvas fills. So bounds must ALSO be
  // section-relative, starting at 0 — NOT stage-absolute. Using stage-absolute
  // bounds here pushes the card off by the rail's width and clamps it against
  // the wrong edge.
  //
  // The stage is a fixed 1920x1080 with fixed padding, so the wheel column's
  // size is a constant, not something to measure.
  const bounds = useMemo(
    () => ({
      left: CARD_MARGIN,
      top: CARD_MARGIN,
      right: WHEEL_W - CARD_MARGIN,
      bottom: WHEEL_H - CARD_MARGIN,
    }),
    [],
  );

  // A real funnel outcome for the lead currently on screen does two things:
  // flips its node to closed, and pushes a REAL line into the conversions
  // feed. Ambient rail numbers stay on useLiveTally representing the other 95
  // leads; this is the only line whose value came from the funnel itself.
  const [realFeed, setRealFeed] = useState<FeedEvent[]>([]);
  const seenRef = useRef<Set<number>>(new Set());
  const realKeyRef = useRef(1_000_000); // above useLiveTally's key space

  useEffect(() => {
    if (!app || tour.leadId === undefined) return;
    const outcome = outcomes[tour.leadId];
    if (!outcome || seenRef.current.has(tour.leadId)) return;
    seenRef.current.add(tour.leadId);

    if (tour.nodeId) app.markClosed(tour.nodeId);

    const identity = identities.find((lead) => lead.id === tour.leadId);
    if (!identity) return;
    setRealFeed((prev) =>
      [
        {
          key: realKeyRef.current++,
          leadNo: identity.leadNo,
          outcome: outcome.outcome,
          valueUsd: outcome.valueUsd,
        },
        ...prev,
      ].slice(0, 4),
    );
  }, [app, outcomes, tour.leadId, tour.nodeId, identities]);

  // Real lines sit on top, ambient lines fill the rest, capped at the rail's
  // visible row count.
  const mergedFeed = useMemo(() => [...realFeed, ...feed].slice(0, 9), [realFeed, feed]);

  const nodePosition = app?.getFocusScreenPosition();

  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${STAGE_W}px`,
          height: `${STAGE_H}px`,
          transform: `scale(${fit})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          padding: `${PAD}px`,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'row',
          gap: `${COL_GAP}px`,
          background: 'linear-gradient(160deg, #ffffff 0%, #f1f5f9 100%)',
          position: 'relative',
        }}
      >
        <ScoreboardRail
          revenue={tally.revenue}
          purchases={tally.purchases}
          calls={tally.calls}
          upsellPct={UPSELL_PCT}
          feed={mergedFeed}
          width={RAIL_W}
        />

        <section style={{ flex: 1, position: 'relative' }}>
          <LatticeCanvas onReady={handleReady} />

          <QuizCard
            leadId={tour.leadId}
            nextLeadId={tour.nextLeadId}
            nodePosition={nodePosition}
            bounds={bounds}
            visible={tour.phase === 'drill'}
          />
        </section>
      </div>
    </main>
  );
}
