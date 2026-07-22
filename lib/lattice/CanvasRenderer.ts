import type { WheelGraph, WheelNode } from "./types";
import { polarToCartesian, wheelRadiusFor } from "./wheelLayout";

const PALETTE = {
  background: "#f7f8f7",
  edge: "rgba(20, 32, 27, 0.18)",
  centerText: "#f7f8f7",
  personText: "#f7f8f7",
  hubLabelText: "#14201b",
  faded: "rgba(20, 32, 27, 0.5)",
};

const FADE_ALPHA = 0.12;
const FADE_NODE_RADIUS = 3;

// Clicking a node zooms the camera toward it, matching the reference's
// "click any node to focus on it" behavior rather than a flat zone dim.
// Kept modest (not a dramatic zoom-in) per direct feedback that 1.8 felt
// like too much.
export const FOCUS_ZOOM = 1.3;

export interface Camera {
  scale: number;
  lookAtX: number;
  lookAtY: number;
}

// The un-focused view: no zoom, looking at canvas center. createVisualizerApp
// keeps a persistent Camera and eases it toward whichever of these two
// targets is current every frame, so switching *between* two focused nodes
// pans smoothly instead of snapping (there's no separate "just zoomed in"
// vs "just switched" case — it's always "ease the camera toward its
// current target").
export function identityCamera(width: number, height: number): Camera {
  return { scale: 1, lookAtX: width / 2, lookAtY: height / 2 };
}

export function focusedCamera(focusedPosition: { x: number; y: number }): Camera {
  return { scale: FOCUS_ZOOM, lookAtX: focusedPosition.x, lookAtY: focusedPosition.y };
}

export function nodePixelPosition(
  node: WheelNode,
  width: number,
  height: number,
): { x: number; y: number } {
  const centerX = width / 2;
  const centerY = height / 2;
  const wheelRadius = wheelRadiusFor(width, height);
  return polarToCartesian(centerX, centerY, node.angle, node.radiusFraction * wheelRadius);
}

// The focused node plus everything directly linked to it stay in full
// detail; everything else fades to a soft, undetailed shape (see
// drawFadedNode) instead of just a lower-opacity copy of itself.
export function neighborIds(graph: WheelGraph, focusedNodeId: string): Set<string> {
  const ids = new Set<string>([focusedNodeId]);
  for (const link of graph.links) {
    if (link.sourceId === focusedNodeId) ids.add(link.targetId);
    if (link.targetId === focusedNodeId) ids.add(link.sourceId);
  }
  return ids;
}

export function nodeIdAtPoint(
  pointX: number,
  pointY: number,
  nodes: WheelNode[],
  width: number,
  height: number,
  tolerancePx = 4,
): string | undefined {
  let closestId: string | undefined;
  let closestDistance = Infinity;
  for (const node of nodes) {
    const position = nodePixelPosition(node, width, height);
    const distance = Math.hypot(pointX - position.x, pointY - position.y);
    if (distance <= node.radius + tolerancePx && distance < closestDistance) {
      closestDistance = distance;
      closestId = node.id;
    }
  }
  return closestId;
}

// Inverse of the render()-time camera transform: translates a click's raw
// canvas coordinates back into the same space nodePixelPosition works in,
// using whatever camera state is actually on screen right now (not assuming
// fully zoomed), so hit-testing stays correct mid-animation too.
export function screenToWorld(
  screenX: number,
  screenY: number,
  width: number,
  height: number,
  camera: Camera,
): { x: number; y: number } {
  return {
    x: (screenX - width / 2) / camera.scale + camera.lookAtX,
    y: (screenY - height / 2) / camera.scale + camera.lookAtY,
  };
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(
        "This browser could not create a 2D canvas. Try a current version of Chrome or Edge.",
      );
    }
    this.ctx = context;
  }

  render(graph: WheelGraph, focusedNodeId: string | undefined, camera?: Camera): void {
    const { ctx, canvas } = this;
    const width = canvas.width;
    const height = canvas.height;
    const activeCamera = camera ?? identityCamera(width, height);
    // How "zoomed in" the current (already-eased) camera is, 0..1 — drives
    // the dim/highlight crossfade so it tracks the actual on-screen zoom
    // instead of a separate, possibly out-of-sync progress value.
    const focusStrength = Math.min(1, Math.max(0, (activeCamera.scale - 1) / (FOCUS_ZOOM - 1)));

    ctx.fillStyle = PALETTE.background;
    ctx.fillRect(0, 0, width, height);

    const positionById = new Map(
      graph.nodes.map((node) => [node.id, nodePixelPosition(node, width, height)]),
    );
    const focusedIds = focusedNodeId ? neighborIds(graph, focusedNodeId) : undefined;

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(activeCamera.scale, activeCamera.scale);
    ctx.translate(-activeCamera.lookAtX, -activeCamera.lookAtY);

    ctx.lineWidth = 1;
    ctx.strokeStyle = PALETTE.edge;
    for (const link of graph.links) {
      const source = positionById.get(link.sourceId);
      const target = positionById.get(link.targetId);
      if (!source || !target) continue;
      const isNeighborLink = !focusedIds || (focusedIds.has(link.sourceId) && focusedIds.has(link.targetId));
      ctx.globalAlpha = isNeighborLink ? 1 : 1 - focusStrength;
      if (ctx.globalAlpha <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    }

    for (const node of graph.nodes) {
      const position = positionById.get(node.id);
      if (!position) continue;
      const isNeighbor = !focusedIds || focusedIds.has(node.id);
      if (isNeighbor) {
        ctx.globalAlpha = 1;
        this.drawNode(node, position);
      } else {
        // Crossfade: full detail fades out as the camera zooms in, while
        // the soft faded dot fades in at the same rate.
        ctx.globalAlpha = 1 - focusStrength;
        this.drawNode(node, position);
        this.drawFadedNode(position, focusStrength);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawFadedNode(position: { x: number; y: number }, focusStrength: number): void {
    const { ctx } = this;
    ctx.globalAlpha = FADE_ALPHA * focusStrength;
    ctx.fillStyle = PALETTE.faded;
    ctx.beginPath();
    ctx.arc(position.x, position.y, FADE_NODE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawNode(node: WheelNode, position: { x: number; y: number }): void {
    const { ctx } = this;

    if (node.ring === "center") {
      const size = node.radius * 2;
      ctx.fillStyle = node.color;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(position.x - node.radius, position.y - node.radius, size, size, 4);
      } else {
        ctx.rect(position.x - node.radius, position.y - node.radius, size, size);
      }
      ctx.fill();
      ctx.fillStyle = PALETTE.centerText;
      ctx.font = "12px Inter, ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("K", position.x, position.y);
      return;
    }

    if (node.ring === "icon") {
      const size = node.radius * 2;
      ctx.fillStyle = node.color;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(position.x - node.radius, position.y - node.radius, size, size, 3);
      } else {
        ctx.rect(position.x - node.radius, position.y - node.radius, size, size);
      }
      ctx.fill();
      return;
    }

    if (node.ring === "hub" || node.ring === "avatar") {
      ctx.fillStyle = node.color;
      ctx.beginPath();
      ctx.arc(position.x, position.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      if (node.initials) {
        ctx.fillStyle = PALETTE.personText;
        ctx.font = `${Math.max(6, node.radius)}px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.initials, position.x, position.y);
      }
      if (node.ring === "hub" && node.label) {
        // Hubs sit close together on a small inner ring, so a label drawn
        // straight below every hub collides with its neighbors. Push each
        // label outward along its own hub's angle instead, fanning the 6
        // labels apart in 6 different directions.
        const labelOffset = node.radius + 14;
        const labelX = position.x + Math.cos(node.angle) * labelOffset;
        const labelY = position.y + Math.sin(node.angle) * labelOffset;
        ctx.fillStyle = PALETTE.hubLabelText;
        ctx.font = "12px Inter, ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = Math.cos(node.angle) >= 0 ? "left" : "right";
        ctx.textBaseline = "middle";
        ctx.fillText(node.label, labelX, labelY);
      }
      return;
    }

    ctx.fillStyle = node.color;
    ctx.beginPath();
    ctx.arc(position.x, position.y, node.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }
}
