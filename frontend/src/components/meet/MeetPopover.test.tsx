// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MeetMenu } from "./MeetPopover";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let trigger: HTMLButtonElement;
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON() {} });
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 640 });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(270);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(180);
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  trigger = document.createElement("button"); document.body.append(trigger);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); trigger.remove(); document.querySelector(".mobile-nav")?.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function open(left: number, top: number, align: "start" | "end" = "start") {
  trigger.getBoundingClientRect = () => rect(left, top, 100, 44);
  const ref = createRef<HTMLElement>(); ref.current = trigger;
  await act(async () => {
    root.render(<MeetMenu open onClose={() => {}} triggerRef={ref} placement="bottom" align={align} label="New meeting" items={[{ key: "new", label: "Create", onSelect() {} }]} />);
  });
  return document.querySelector<HTMLElement>('[role="menu"]')!;
}
it("clamps a start-aligned menu inside the right edge", async () => {
  const menu = await open(180, 100);
  expect(menu.parentElement).toBe(document.body);
  expect(Number.parseFloat(menu.style.left)).toBe(42);
  expect(Number.parseFloat(menu.style.top)).toBe(150);
});
it("opens above the trigger and stays clear of the mobile dock", async () => {
  const dock = document.createElement("nav"); dock.className = "mobile-nav";
  dock.getBoundingClientRect = () => rect(0, 562, 320, 70); document.body.append(dock);
  const menu = await open(110, 490);
  expect(Number.parseFloat(menu.style.top)).toBe(304);
  expect(Number.parseFloat(menu.style.top) + 180).toBeLessThan(554);
});
it("keeps an offscreen trigger's menu visible and updates on resize", async () => {
  const menu = await open(10, 850, "end");
  expect(Number.parseFloat(menu.style.left)).toBe(8);
  expect(Number.parseFloat(menu.style.top)).toBe(452);
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 400 });
  await act(async () => { window.dispatchEvent(new Event("resize")); });
  expect(Number.parseFloat(menu.style.top)).toBe(212);
});
