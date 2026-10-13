import { describe, expect, it } from "vitest";
import { glassBudget, glassConfig, LIQUID_PRESS } from "./liquidGlass";

describe("liquid glass materials", () => {
  it("keeps a smaller optical budget on phones", () => {
    expect(glassBudget(390)).toBe(12);
    expect(glassBudget(820)).toBe(12);
    expect(glassBudget(1440)).toBe(22);
  });
  it("preserves the chosen theme instead of the operating system theme", () => {
    expect(glassConfig("chrome", true, 8, false).appearance).toBe("dark");
    expect(glassConfig("chrome", false, 8, false).appearance).toBe("light");
  });
  it("keeps menus readable and avoids camera or text parallax", () => {
    const menu = glassConfig("panel", true, 8, false);
    expect(menu.blur).toBeGreaterThan(glassConfig("control", true, 8, false).blur!);
    expect(menu.refractionStrength).toBeLessThan(glassConfig("navigation", true, 8, false).refractionStrength!);
    expect(menu.parallax).toBe(false);
    expect(menu.respectPreferences).toBe(true);
  });
  it("turns off cursor tracking on touchscreens and retains circular geometry", () => {
    const config = glassConfig("control", false, 22, true);
    expect(config.cursorTracking).toBe(false);
    expect(config.hoverLighting).toBe(false);
    expect(config.quality).toBe("low");
    expect(config.borderRadius).toBe(22);
  });
  it("uses coherent frost while retaining pronounced, rounded lensing", () => {
    for (const kind of ["navigation", "chrome", "control"] as const) {
      const config = glassConfig(kind, true, 16, false);
      expect(config.material).toBe(kind === "chrome" ? "thin" : "clear");
      expect(config.blur).toBeGreaterThanOrEqual(2.5);
      expect(config.refractionStrength).toBeGreaterThanOrEqual(42);
      expect(config.ior).toBe(1.65);
      expect(config.edgeHighlight).toBe(.2);
      expect(config.specularStrength).toBe(.08);
      expect(glassConfig(kind, false, 16, false).edgeHighlight).toBeGreaterThanOrEqual(.75);
      expect(config.chromaticAberration).toBe(.1);
      expect(config.bezelWidth).toBeLessThanOrEqual(16 * .6);
    }
  });
  it("keeps the wide mobile lenses sharp while budgeting smaller controls", () => {
    expect(glassConfig("navigation", false, 16, true).quality).toBe("medium");
    expect(glassConfig("chrome", false, 8, true).quality).toBe("medium");
    expect(glassConfig("panel", false, 8, true).quality).toBe("low");
  });
  it("gives the background a visible elastic press without moving the content", () => {
    expect(LIQUID_PRESS.scale).toBe(.93);
    expect(LIQUID_PRESS.squish).toBe(.035);
  });
  it("bounds refraction and the bezel to the actual lens size", () => {
    for (const size of [38, 44, 68, 76]) {
      const config = glassConfig("navigation", true, 16, size < 68, size);
      expect(config.refractionStrength).toBeLessThanOrEqual(size * .42);
      expect(config.bezelWidth).toBeLessThanOrEqual(size * .28);
      expect(config.thickness).toBeLessThanOrEqual(size * .45);
    }
    expect(glassConfig("panel", true, 8, true, 320).refractionStrength).toBe(10);
  });
  it("keeps full-width bands soft instead of lensing their rectangular frame", () => {
    const plane = glassConfig("chrome", true, 0, true, 64);
    expect(plane.refractionStrength).toBe(12);
    expect(plane.edgeHighlight).toBe(.2);
    expect(plane.blur).toBe(10);
    expect(glassConfig("navigation", true, 22, true, 72).blur).toBe(30);
  });
  it("frosts navigation more strongly than ordinary controls to hide background text", () => {
    expect(glassConfig("navigation", false, 24, false, 78).blur).toBeGreaterThan(glassConfig("chrome", false, 20, false, 64).blur!);
    expect(glassConfig("navigation", true, 22, true, 72).blur).toBeGreaterThanOrEqual(28);
  });
});
