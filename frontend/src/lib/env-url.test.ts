import { describe, expect, it } from "vitest";
import { envUrl } from "./env-url";

describe("envUrl", () => {
  it("adds https to a bare host", () => expect(envUrl("api.honeymedia.uz/api/v1")).toBe("https://api.honeymedia.uz/api/v1"));
  it("keeps full URLs and drops a trailing slash", () => expect(envUrl("https://api.honeymedia.uz/api/v1/")).toBe("https://api.honeymedia.uz/api/v1"));
  it("keeps relative paths", () => expect(envUrl("/api/v1")).toBe("/api/v1"));
  it("treats empty as unset", () => expect(envUrl("  ")).toBeUndefined());
});
