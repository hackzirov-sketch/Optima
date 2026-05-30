import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("filters falsy values", () => {
    expect(cn("foo", false, null, undefined, "bar")).toBe("foo bar");
  });

  it("handles tailwind-merge conflicts", () => {
    expect(cn("px-4", "px-2")).toBe("px-2");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });
});
