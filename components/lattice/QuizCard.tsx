'use client';

import { useState } from 'react';
import { C, R, buildFunnelSrc } from '@/lib/adStage';
import { placeCard, type Bounds } from '@/lib/lattice/cardPlacement';
import { buildLeadIdentities } from '@/lib/lattice/leads';

export const CARD_SIZE = { width: 420, height: 560 };

const IDENTITIES = buildLeadIdentities();
const FUNNEL_OPTS = { count: 8, demoScale: 0.62, speed: 0.5 };

/**
 * Two iframes are kept mounted and cross-faded. Mounting a fresh iframe per
 * drill would show a visible reload flash on camera, so the inactive slot
 * preloads the next lead's funnel while the wide and pullback beats play.
 */
export function QuizCard({
  leadId,
  nextLeadId,
  nodePosition,
  bounds,
  visible,
}: {
  leadId: number | undefined;
  nextLeadId: number | undefined;
  nodePosition: { x: number; y: number } | undefined;
  bounds: Bounds;
  visible: boolean;
}) {
  // One piece of state, so the active slot, what each slot holds, and the
  // props that produced them can never disagree. `slots[i]` is the lead each
  // iframe currently has loaded; `leadId`/`nextLeadId` are the props that
  // last drove it, so a prop change can be detected during render instead of
  // in an effect (React's sanctioned "adjusting state during render"
  // pattern — see https://react.dev/learn/you-might-not-need-an-effect).
  const [pool, setPool] = useState<{
    slots: [number | undefined, number | undefined];
    active: number;
    leadId: number | undefined;
    nextLeadId: number | undefined;
  }>({ slots: [undefined, undefined], active: 0, leadId: undefined, nextLeadId: undefined });

  if (pool.leadId !== leadId || pool.nextLeadId !== nextLeadId) {
    const slots: [number | undefined, number | undefined] = [pool.slots[0], pool.slots[1]];
    let active = pool.active;

    // Show the current lead. If the idle slot preloaded it during the last
    // wide/pullback beat, this is a pure swap with nothing to fetch.
    if (leadId !== undefined && slots[active] !== leadId) {
      const other = active === 0 ? 1 : 0;
      if (slots[other] !== leadId) slots[other] = leadId;
      active = other;
    }

    // Park the UPCOMING lead in whichever slot is now idle, so its funnel is
    // already running by the time the next drill starts. This is the whole
    // point of a two-iframe pool; without it the pool buys nothing and every
    // drill opens on a visible reload.
    const idle = active === 0 ? 1 : 0;
    if (nextLeadId !== undefined && nextLeadId !== leadId && slots[idle] !== nextLeadId) {
      slots[idle] = nextLeadId;
    }

    setPool({ slots, active, leadId, nextLeadId });
  }

  const { slots, active } = pool;

  const anchor = nodePosition ?? { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const placement = placeCard(anchor, CARD_SIZE, bounds);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${placement.x}px`,
        top: `${placement.y}px`,
        width: `${CARD_SIZE.width}px`,
        height: `${CARD_SIZE.height}px`,
        borderRadius: R.lg,
        overflow: 'hidden',
        background: C.card,
        border: `1px solid ${C.border}`,
        boxShadow: C.cardShadow,
        opacity: visible ? 1 : 0,
        transition: 'opacity 420ms ease, left 520ms ease, top 520ms ease',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {slots.map((slotLeadId, index) => (
        <iframe
          key={index}
          title={`quiz-slot-${index}`}
          src={
            slotLeadId === undefined
              ? 'about:blank'
              : buildFunnelSrc(
                  { id: slotLeadId, seed: IDENTITIES[slotLeadId]?.seed ?? 7000 },
                  index,
                  FUNNEL_OPTS,
                )
          }
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            opacity: index === active ? 1 : 0,
            transition: 'opacity 320ms ease',
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  );
}
