import { describe, expect, it } from "vitest";
import { menuPosition } from "./menuPosition";

describe("message menu placement", () => {
  const menu = { width: 280, height: 360 };
  it("opens below its trigger when space is available", () => {
    expect(menuPosition({ left: 800, right: 832, top: 80, bottom: 112 }, menu, { width: 1440, height: 900 })).toEqual({ left: 552, top: 118 });
  });
  it("flips above the trigger near the composer", () => {
    expect(menuPosition({ left: 280, right: 312, top: 700, bottom: 732 }, menu, { width: 390, height: 844 })).toEqual({ left: 32, top: 334 });
  });
  it("keeps menus inside small screens", () => {
    expect(menuPosition({ left: 0, right: 30, top: 2, bottom: 32 }, menu, { width: 320, height: 480 })).toEqual({ left: 12, top: 38 });
  });
  it("respects visual viewport offsets when a keyboard is open", () => {
    const point = menuPosition({ left: 280, right: 312, top: 530, bottom: 562 }, { width: 280, height: 240 }, { width: 390, height: 350, top: 200 });
    expect(point.top).toBeGreaterThanOrEqual(212);
    expect(point.top + 240).toBeLessThanOrEqual(538);
  });
});
