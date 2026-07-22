import { describe, expect, it } from "vitest";
import {
  focusedCamera,
  FOCUS_ZOOM,
  identityCamera,
  neighborIds,
  nodeIdAtPoint,
  nodePixelPosition,
  screenToWorld,
} from "./CanvasRenderer";
import type { WheelGraph, WheelNode } from "./types";

describe("nodePixelPosition", () => {
  it("places a node at its angle/radiusFraction relative to canvas center", () => {
    const node: WheelNode = {
      id: "hub-0",
      ring: "hub",
      zoneIndex: 0,
      angle: 0,
      radiusFraction: 0.22,
      radius: 16,
      color: "#2f6df6",
    };
    const position = nodePixelPosition(node, 800, 600);
    // wheelRadius = 0.42*600 = 252; hub radius-from-center = 0.22*252 = 55.44
    expect(position.x).toBeCloseTo(400 + 55.44, 1);
    expect(position.y).toBeCloseTo(300, 1);
  });
});

describe("neighborIds", () => {
  const center: WheelNode = {
    id: "center",
    ring: "center",
    angle: 0,
    radiusFraction: 0,
    radius: 14,
    color: "#14201b",
  };
  const hub0: WheelNode = {
    id: "hub-0",
    ring: "hub",
    zoneIndex: 0,
    angle: 0,
    radiusFraction: 0.22,
    radius: 16,
    color: "#2f6df6",
  };
  const icon0: WheelNode = {
    id: "icon-0-0",
    ring: "icon",
    zoneIndex: 0,
    angle: 0.1,
    radiusFraction: 0.66,
    radius: 6,
    color: "#2f6df6",
  };
  const hub1: WheelNode = {
    id: "hub-1",
    ring: "hub",
    zoneIndex: 1,
    angle: 1,
    radiusFraction: 0.22,
    radius: 16,
    color: "#1f9d55",
  };
  const graph: WheelGraph = {
    nodes: [center, hub0, icon0, hub1],
    links: [
      { id: "l0", sourceId: "center", targetId: "hub-0" },
      { id: "l1", sourceId: "hub-0", targetId: "icon-0-0" },
      { id: "l2", sourceId: "center", targetId: "hub-1" },
    ],
  };

  it("includes the focused node itself and its direct neighbors, not further nodes", () => {
    const ids = neighborIds(graph, "hub-0");
    expect(ids).toEqual(new Set(["hub-0", "center", "icon-0-0"]));
    expect(ids.has("hub-1")).toBe(false);
  });

  it("finds neighbors regardless of which link direction the focused node is on", () => {
    const ids = neighborIds(graph, "icon-0-0");
    expect(ids).toEqual(new Set(["icon-0-0", "hub-0"]));
  });
});

describe("nodeIdAtPoint", () => {
  const width = 800;
  const height = 600;
  const hub0: WheelNode = {
    id: "hub-0",
    ring: "hub",
    zoneIndex: 0,
    angle: 0,
    radiusFraction: 0.22,
    radius: 16,
    color: "#2f6df6",
  };
  const nodes = [hub0];

  it("returns the node's id when the point lands within its radius plus tolerance", () => {
    const position = nodePixelPosition(hub0, width, height);
    expect(nodeIdAtPoint(position.x, position.y, nodes, width, height)).toBe("hub-0");
    expect(nodeIdAtPoint(position.x + 18, position.y, nodes, width, height)).toBe("hub-0");
  });

  it("returns undefined when the point is far from every node", () => {
    expect(nodeIdAtPoint(0, 0, nodes, width, height)).toBeUndefined();
  });

  it("returns the closest node when candidates overlap", () => {
    const near: WheelNode = { ...hub0, id: "near", radiusFraction: 0.221 };
    const far: WheelNode = { ...hub0, id: "far", radiusFraction: 0.3 };
    const position = nodePixelPosition(near, width, height);
    expect(nodeIdAtPoint(position.x, position.y, [far, near], width, height)).toBe("near");
  });
});

describe("identityCamera / focusedCamera", () => {
  it("identityCamera has no zoom and looks at canvas center", () => {
    const camera = identityCamera(800, 600);
    expect(camera.scale).toBeCloseTo(1);
    expect(camera.lookAtX).toBeCloseTo(400);
    expect(camera.lookAtY).toBeCloseTo(300);
  });

  it("focusedCamera is zoomed to FOCUS_ZOOM and centered on the given position", () => {
    const camera = focusedCamera({ x: 550, y: 350 });
    expect(camera.scale).toBeCloseTo(FOCUS_ZOOM);
    expect(camera.lookAtX).toBeCloseTo(550);
    expect(camera.lookAtY).toBeCloseTo(350);
  });
});

describe("screenToWorld", () => {
  it("is the identity mapping under identityCamera", () => {
    const camera = identityCamera(800, 600);
    const world = screenToWorld(123, 45, 800, 600, camera);
    expect(world.x).toBeCloseTo(123);
    expect(world.y).toBeCloseTo(45);
  });

  it("maps the screen center back to the focused node's world position under focusedCamera", () => {
    const camera = focusedCamera({ x: 455, y: 300 });
    const world = screenToWorld(400, 300, 800, 600, camera);
    expect(world.x).toBeCloseTo(455);
    expect(world.y).toBeCloseTo(300);
  });

  it("scales offsets from center by the inverse of the camera's scale", () => {
    const camera = focusedCamera({ x: 0, y: 0 });
    const world = screenToWorld(400 + 36, 300, 800, 600, camera);
    expect(world.x).toBeCloseTo(36 / FOCUS_ZOOM);
  });
});
