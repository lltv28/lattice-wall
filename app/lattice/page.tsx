'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { ScoreboardRail } from '@/components/rail/ScoreboardRail';
import {
  BASE_CALLS,
  BASE_PURCHASES,
  BASE_REVENUE,
  STAGE_H,
  STAGE_W,
  UPSELL_PCT,
  useFitStage,
  useLiveTally,
  useRecordingChrome,
} from '@/lib/adStage';
import type { VisualizerApp } from '@/lib/lattice/createVisualizerApp';

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

export default function LatticePage() {
  const fit = useFitStage();
  useRecordingChrome('#eef1f5');
  const { tally, feed } = useLiveTally({
    baseRevenue: BASE_REVENUE,
    basePurchases: BASE_PURCHASES,
    baseCalls: BASE_CALLS,
  });

  const [, setApp] = useState<VisualizerApp | null>(null);
  const handleReady = useCallback((ready: VisualizerApp) => setApp(ready), []);

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
          feed={feed}
          width={RAIL_W}
        />

        <section style={{ flex: 1, position: 'relative' }}>
          <LatticeCanvas onReady={handleReady} />
        </section>
      </div>
    </main>
  );
}
