import { describe, expect, it } from "vitest";
import { rescale } from "./rescale";

describe("rescale", () => {
  it("keeps points at the same relative position after a resize", () => {
    const pts = [{ x: 0, y: 0 }, { x: 180, y: 320 }, { x: 360, y: 640 }];
    rescale(pts, { width: 360, height: 640 }, { width: 720, height: 320 });
    expect(pts).toEqual([{ x: 0, y: 0 }, { x: 360, y: 160 }, { x: 720, y: 320 }]);
  });

  it("ignores a zero-sized starting field", () => {
    const pts = [{ x: 5, y: 5 }];
    rescale(pts, { width: 0, height: 0 }, { width: 100, height: 100 });
    expect(pts).toEqual([{ x: 5, y: 5 }]);
  });
});
