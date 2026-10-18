// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LibraryPage } from "./LibraryPage";

const mocks = vi.hoisted(() => ({
  search: vi.fn(async (_options: unknown) => ({ items: [], total: 0, hasMore: false })),
  navigate: vi.fn(), show: vi.fn(), t: (key: string) => key,
}));
vi.mock("../lib/i18n/i18n", () => ({ useI18n: () => ({ t: mocks.t, locale: "uz" }) }));
vi.mock("../components/Toast", () => ({ useToast: () => ({ show: mocks.show }) }));
vi.mock("wouter", () => ({ useParams: () => ({}), useLocation: () => ["/library", mocks.navigate] }));
vi.mock("../lib/api", () => ({ api: { library: {
  search: mocks.search, marks: async () => ({ saved: [], liked: [] }), reading: async () => [], saved: async () => [],
} } }));
vi.mock("../components/BookReader", () => ({ BookReader: () => null }));
let host: HTMLDivElement;
let root: Root;
const panel = () => host.querySelector<HTMLDetailsElement>(".library-filter-panel")!;
async function click(selector: string) {
  await act(async () => { host.querySelector<HTMLButtonElement>(selector)!.click(); });
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(<LibraryPage />); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it("starts compact with search and all four shelves visible", () => {
  expect(panel().open).toBe(false);
  expect(host.querySelector("input[aria-label='library.searchPlaceholder']")).not.toBeNull();
  expect(host.querySelectorAll(".lib2-shelves button")).toHaveLength(4);
  expect(panel().querySelector("summary")?.textContent).toContain("O‘zbekcha");
});
it("preserves selected language and genre when collapsed and reopened", async () => {
  await click(".library-filter-panel > summary"); expect(panel().open).toBe(true);
  await click(".lib2-langs button:nth-child(2)");
  await click(".library-categories button:nth-child(3)");
  expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({ lang: "en", subject: "history" }));
  await click(".library-filter-panel > summary"); expect(panel().open).toBe(false);
  expect(panel().querySelector("summary")?.textContent).toContain("English");
  expect(panel().querySelector("summary")?.textContent).toContain("library.subject_history");
  await click(".library-filter-panel > summary");
  expect(host.querySelector(".lib2-langs button:nth-child(2)")?.getAttribute("aria-pressed")).toBe("true");
  expect(host.querySelector(".library-categories button:nth-child(3)")?.getAttribute("aria-pressed")).toBe("true");
});
it("resets language and genre without clearing the search field", async () => {
  await click(".library-filter-panel > summary");
  await click(".lib2-langs button:nth-child(2)");
  await click(".library-categories button:nth-child(3)");
  const search = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "book");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(".library-filter-reset");
  expect(search.value).toBe("book");
  expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({ lang: "uz", subject: "all" }));
  expect(host.querySelector<HTMLButtonElement>(".library-filter-reset")?.disabled).toBe(true);
});
it("keeps shelves independent and remembers browse filters", async () => {
  await click(".library-filter-panel > summary"); await click(".lib2-langs button:nth-child(2)");
  await click(".lib2-shelves button:nth-child(4)");
  expect(panel()).toBeNull();
  expect(host.querySelector(".lib2-shelves button:nth-child(4)")?.getAttribute("aria-pressed")).toBe("true");
  await click(".lib2-shelves button:first-child");
  expect(panel().querySelector("summary")?.textContent).toContain("English");
});
