// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LibraryPage } from "./LibraryPage";
import type { LibraryBook, LibraryReviews, ReadingProgress } from "../lib/api";

const mocks = vi.hoisted(() => ({
  search: vi.fn(async (_options: unknown): Promise<{ items: LibraryBook[]; total: number; hasMore: boolean }> => ({ items: [], total: 0, hasMore: false })),
  navigate: vi.fn(), show: vi.fn(), t: (key: string) => key,
  params: {} as { slug?: string; mode?: string },
  get: vi.fn(async (_slug: string): Promise<unknown> => ({})),
  open: vi.fn(async (_book: LibraryBook): Promise<unknown> => ({})),
  read: vi.fn(async (_url: string) => ({ content: "", contentType: "text/plain" })),
  progress: vi.fn(async (_slug: string, _progress: ReadingProgress) => ({})),
  reviews: vi.fn(async (_key: string): Promise<LibraryReviews> => ({ items: [], count: 0, average: null })),
  saveReview: vi.fn(async (..._args: unknown[]): Promise<LibraryReviews> => ({ items: [], count: 0, average: null })),
}));
vi.mock("../lib/i18n/i18n", () => ({ useI18n: () => ({ t: mocks.t, locale: "uz" }) }));
vi.mock("../components/Toast", () => ({ useToast: () => ({ show: mocks.show }) }));
vi.mock("wouter", () => ({ useParams: () => mocks.params, useLocation: () => ["/library", mocks.navigate] }));
vi.mock("../lib/api", () => ({ api: { media: { get: mocks.get, progress: mocks.progress, view: async () => ({ views: 1 }) }, library: {
  search: mocks.search, marks: async () => ({ saved: [], liked: [] }), reading: async () => [], saved: async () => [],
  open: mocks.open, read: mocks.read, reviews: mocks.reviews, saveReview: mocks.saveReview,
} } }));
vi.mock("../components/BookReader", () => ({ BookReader: ({ text, initialPosition, onPosition }: { text: string; initialPosition: number; onPosition: (position: number, page: number, total: number) => void }) => <div data-testid="reader">{text}<span data-testid="position">{initialPosition}</span><button onClick={() => onPosition(.7, 7, 10)}>Turn page</button></div> }));
let host: HTMLDivElement;
let root: Root;
const panel = () => host.querySelector<HTMLDetailsElement>(".library-filter-panel")!;
async function click(selector: string) {
  await act(async () => { host.querySelector<HTMLButtonElement>(selector)!.click(); });
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  mocks.params = {};
  mocks.search.mockResolvedValue({ items: [], total: 0, hasMore: false });
  mocks.reviews.mockResolvedValue({ items: [], count: 0, average: null });
  localStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(<LibraryPage />); });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const book = (key: string): LibraryBook => ({ key, id: key, title: `Book ${key}`, authors: ["Author"], languages: ["en"], year: "2000", downloads: 1, description: "Description", cover: "", embedUrl: null, textUrl: `/${key}.txt`, sourceUrl: "https://example.invalid/book", source: "gutenberg", readable: true });
const record = (slug: string, position = .1) => ({ slug, provider: "library", meta: { book: book(slug) }, progress: { position, page: 1, totalPages: 10 }, views: 1 });
const review = (key: string): LibraryReviews => ({ count: 1, average: 4, items: [{ id: key, rating: 4, body: `Review ${key}`, createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z", mine: true, author: { id: "me", firstName: "Test", lastName: "User", username: "test", avatarUrl: null } }] });
async function route(slug?: string, mode?: string) {
  mocks.params = { slug, mode };
  await act(async () => { root.render(<LibraryPage />); });
}

it("ignores a previous book's late reviews and form values", async () => {
  const old = deferred<LibraryReviews>();
  mocks.get.mockImplementation(async slug => record(slug));
  mocks.reviews.mockImplementation(async key => key === "A" ? old.promise : review(key));
  await route("A"); await route("B");
  expect(host.querySelector(".lib2-review-form textarea")?.textContent).toBe("Review B");
  await act(async () => { old.resolve(review("A")); });
  expect(host.querySelector(".lib2-review-form textarea")?.textContent).toBe("Review B");
  expect(host.querySelector(".lib2-reviews")?.textContent).not.toContain("Review A");
});

it("does not apply a late review save to another book", async () => {
  const old = deferred<LibraryReviews>();
  mocks.get.mockImplementation(async slug => record(slug));
  mocks.reviews.mockImplementation(async key => review(key));
  mocks.saveReview.mockReturnValue(old.promise);
  await route("A");
  await act(async () => { host.querySelector(".lib2-review-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await route("B");
  await act(async () => { old.resolve(review("saved-A")); });
  expect(host.querySelector(".lib2-reviews")?.textContent).toContain("Review B");
  expect(host.querySelector(".lib2-reviews")?.textContent).not.toContain("saved-A");
});

it("keeps late reader text and progress out of the newly opened book", async () => {
  const oldRecord = deferred<unknown>();
  const oldText = deferred<{ content: string; contentType: string }>();
  mocks.get.mockImplementation(async slug => record(slug));
  mocks.open.mockImplementation(async value => value.key === "A" ? oldRecord.promise : record(value.key, .6));
  mocks.read.mockImplementation(async url => url === "/A.txt" ? oldText.promise : { content: "B text", contentType: "text/plain" });
  await route("A", "read"); await route("B", "read");
  expect(host.querySelector("[data-testid='reader']")?.textContent).toContain("B text");
  expect(host.querySelector("[data-testid='position']")?.textContent).toBe("0.6");
  await act(async () => { oldRecord.resolve(record("A", .2)); oldText.resolve({ content: "A text", contentType: "text/plain" }); });
  expect(host.querySelector("[data-testid='reader']")?.textContent).toContain("B text");
  expect(host.querySelector("[data-testid='position']")?.textContent).toBe("0.6");
  await click("[data-testid='reader'] button");
  expect(JSON.parse(localStorage.getItem("optima-read:B")!).position).toBe(.7);
  expect(localStorage.getItem("optima-read:A")).toBeNull();
  await route();
  expect(mocks.progress).toHaveBeenLastCalledWith("B", expect.objectContaining({ position: .7 }));
});

it("ignores an old reader error after switching to a working book", async () => {
  const old = deferred<{ content: string; contentType: string }>();
  mocks.get.mockImplementation(async slug => record(slug));
  mocks.open.mockImplementation(async value => record(value.key));
  mocks.read.mockImplementation(async url => url === "/A.txt" ? old.promise : { content: "B text", contentType: "text/plain" });
  await route("A", "read"); await route("B", "read");
  await act(async () => { old.reject(new Error("offline")); });
  expect(host.querySelector(".reader-failed")).toBeNull();
  expect(host.querySelector("[data-testid='reader']")?.textContent).toContain("B text");
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
