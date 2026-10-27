// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { LandingPage } from "./LandingPage";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

it("offers registration and login without hiding any services", () => {
  act(() => root.render(<LandingPage />));
  expect(host.querySelector('a[href="/login?mode=register"]')).not.toBeNull();
  expect(host.querySelector('a[href="/login"]')).not.toBeNull();
  expect(host.querySelectorAll(".landing-service")).toHaveLength(6);
  expect(host.querySelectorAll("details")).toHaveLength(5);
  expect(host.querySelector('a[href="/chat?demo=1"]')?.textContent).toContain("Demoni ko‘rish");
});

it("opens real sections for signed-in visitors", () => {
  act(() => root.render(<LandingPage authenticated />));
  expect(host.querySelector('a[href="/education"]')).not.toBeNull();
  expect(host.querySelector('a[href="/statistics"]')).not.toBeNull();
  expect(host.querySelector('.landing-login')?.getAttribute("href")).toBe("/login");
  expect(host.querySelector('.landing-signup')?.getAttribute("href")).toBe("/login?mode=register");
});

it("closes mobile navigation after selecting a section", () => {
  act(() => root.render(<LandingPage />));
  const toggle = host.querySelector<HTMLButtonElement>(".landing-menu-toggle")!;
  act(() => toggle.click());
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  act(() => host.querySelector<HTMLAnchorElement>('nav a[href="#talim"]')!.click());
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
});

it("persists only the public-page theme", () => {
  act(() => root.render(<LandingPage />));
  act(() => host.querySelector<HTMLButtonElement>(".landing-header-actions button")!.click());
  expect(host.querySelector(".public-landing")?.getAttribute("data-scheme")).toBe("dark");
  expect(localStorage.getItem("optima-public-theme")).toBe("dark");
  expect(localStorage.length).toBe(1);
});
