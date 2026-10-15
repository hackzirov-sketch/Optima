// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmojiPickerButton } from "./EmojiPicker";

vi.mock("../lib/emojiAssets", () => ({
  emojiPreviewUrl: () => "/emoji.png",
  fetchEmojiManifest: async () => [],
  fetchAnimatedEmojiManifest: async () => [],
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<EmojiPickerButton onSelect={() => {}} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function openPicker() {
  const trigger = container.querySelector<HTMLButtonElement>("button")!;
  trigger.focus();
  await act(async () => trigger.click());
  return trigger;
}

describe("emoji picker dismissal", () => {
  it("returns focus to the trigger when Escape closes a focused picker control", async () => {
    const trigger = await openPicker();
    const close = container.querySelector<HTMLButtonElement>('[aria-label="Yopish"]')!;
    close.focus();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => { close.dispatchEvent(escape); });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(escape.defaultPrevented).toBe(true);
  });

  it("does not steal focus from an outside control when dismissed", async () => {
    await openPicker();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    await act(async () => { outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });
});
