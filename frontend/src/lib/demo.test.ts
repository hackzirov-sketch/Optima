// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { assertDemoRequest, initializeDemo, isDemoMode } from "./demo";

afterEach(() => { sessionStorage.clear(); window.history.replaceState({}, "", "/"); });

it("keeps demo navigation in this tab and exits without altering login state", () => {
  localStorage.setItem("optima_session_active", "1");
  window.history.replaceState({}, "", "/chat?demo=1");
  initializeDemo();
  window.history.replaceState({}, "", "/meetings");
  expect(isDemoMode()).toBe(true);
  window.history.replaceState({}, "", "/login?demo=0");
  initializeDemo();
  expect(isDemoMode()).toBe(false);
  expect(localStorage.getItem("optima_session_active")).toBe("1");
  localStorage.removeItem("optima_session_active");
});

it("allows sample reads and workspace setup, blocks all user writes", () => {
  expect(() => assertDemoRequest("/chat/rooms")).not.toThrow();
  expect(() => assertDemoRequest("/groups/local-workspace/select", "POST")).not.toThrow();
  for (const [path, method] of [["/chat/rooms/local-room/messages", "POST"], ["/users/me", "PATCH"], ["/chat/uploads/presign", "POST"], ["/meetings/id/join", "POST"], ["/auth/login", "POST"], ["/library/books/id/save", "PUT"], ["/chat/rooms/id", "DELETE"]]) {
    expect(() => assertDemoRequest(path, method)).toThrow("demo rejimida yopiq");
  }
});
