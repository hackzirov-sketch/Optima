// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EducationPage } from "./EducationPage";
import { YoutubePage } from "./YoutubePage";
import { UsageTracker } from "../components/UsageTracker";

const mocks = vi.hoisted(() => ({
  path: "/education", params: {} as { slug?: string }, navigate: vi.fn(), show: vi.fn(), t: (key: string) => key,
  videos: vi.fn(async (_options: { subject?: string; q?: string; page?: number }): Promise<{ items: unknown[]; hasMore?: boolean }> => ({ items: [] })),
  save: vi.fn(async () => ({ saved: true })),
  unsave: vi.fn(async () => ({ saved: false })),
  complete: vi.fn(async () => ({ completed: true })),
  like: vi.fn(async () => ({ liked: true, likes: 1 })),
  unlike: vi.fn(async () => ({ liked: false, likes: 0 })),
  lesson: vi.fn(async (_id: string): Promise<unknown> => ({})),
  mentor: vi.fn(async (_id: string, _question: string): Promise<{ reply: string }> => ({ reply: "answer" })),
  addNote: vi.fn(async (_id: string, _note: string): Promise<unknown> => ({})),
  openVideo: vi.fn(async (_id: string): Promise<unknown> => ({ slug: "watch" })),
  recordUsage: vi.fn(),
}));
vi.mock("wouter", () => ({ useLocation: () => [mocks.path, mocks.navigate], useParams: () => mocks.params }));
vi.mock("../lib/i18n/i18n", () => ({ useI18n: () => ({ t: mocks.t, locale: "en" }) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("../components/Toast", () => ({ useToast: () => ({ show: mocks.show }) }));
vi.mock("../components/YoutubeDescription", () => ({ YoutubeDescription: () => null }));
vi.mock("../lib/usage", () => ({ recordUsage: mocks.recordUsage }));
vi.mock("../lib/api", () => ({ api: {
  education: {
    home: async () => ({ subjects: [{ id: "ielts", name: "IELTS", description: "English" }, { id: "mathematics", name: "Math", description: "Math" }], trustedChannels: [], latest: [], continueLearning: [], saved: [] }),
    videos: mocks.videos, video: mocks.lesson, mentor: mocks.mentor, addNote: mocks.addNote,
    save: mocks.save, unsave: mocks.unsave, complete: mocks.complete,
  },
  youtube: { status: async () => ({ enabled: true }), feed: async () => ({ items: [{ youtubeVideoId: "abcdefghijk", title: "Video", channelName: "Channel", durationSeconds: 60 }], hasMore: false }), search: async () => ({ items: [], nextPageToken: null }) },
  media: { youtube: mocks.openVideo, get: async (slug: string) => ({ slug, externalId: "abcdefghijk", title: "Video", meta: {}, liked: false, likes: 0, views: 0, myViews: 0 }), view: async () => ({ views: 1 }), watch: async () => ({}), like: mocks.like, unlike: mocks.unlike },
} }));

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const video = (id: string) => ({ id, youtubeVideoId: "abcdefghijk", title: `Lesson ${id}`, durationSeconds: 60, subject: "ielts", channelName: "Channel", progress: 0, saved: false, lastPositionSeconds: 0, completed: false, related: [] });
let host: HTMLDivElement; let root: Root;
async function render(node: ReactNode, path = mocks.path) {
  mocks.path = path; window.history.replaceState({}, "", path);
  await act(async () => { root.render(node); });
}
async function type(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype = node instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function tick(ms = 300) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
const note = () => host.querySelector<HTMLTextAreaElement>(".lesson-notes textarea")!;
const question = () => host.querySelector<HTMLTextAreaElement>(".mentor-input textarea")!;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.path = "/education"; mocks.params = {};
  mocks.videos.mockResolvedValue({ items: [] });
  mocks.lesson.mockImplementation(async id => video(id));
  mocks.mentor.mockResolvedValue({ reply: "answer" }); mocks.addNote.mockResolvedValue({}); mocks.openVideo.mockResolvedValue({ slug: "watch" });
  mocks.save.mockResolvedValue({ saved: true }); mocks.complete.mockResolvedValue({ completed: true });
  mocks.like.mockResolvedValue({ liked: true, likes: 1 });
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear(); localStorage.setItem("optima-education-subject", "ielts");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("education request ownership", () => {
  it.each(["save", "complete"])("preserves both results when %s finishes first and blocks duplicate clicks", async first => {
    const saved = deferred<{ saved: boolean }>(); const completed = deferred<{ completed: boolean }>();
    mocks.save.mockReturnValue(saved.promise); mocks.complete.mockReturnValue(completed.promise);
    await render(<EducationPage />, "/education/lesson/A");
    await act(async () => {
      const save = host.querySelector<HTMLButtonElement>(".lesson-top > button:last-child")!;
      const complete = host.querySelector<HTMLButtonElement>(".lesson-complete")!;
      save.click(); save.click(); complete.click(); complete.click();
    });
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(mocks.complete).toHaveBeenCalledTimes(1);
    if (first === "save") {
      await act(async () => { saved.resolve({ saved: true }); });
      await act(async () => { completed.resolve({ completed: true }); });
    } else {
      await act(async () => { completed.resolve({ completed: true }); });
      await act(async () => { saved.resolve({ saved: true }); });
    }
    expect(host.querySelector(".lesson-top > button:last-child")?.textContent).toContain("education.saved");
    expect(host.querySelector<HTMLButtonElement>(".lesson-complete")!.disabled).toBe(true);
  });
  it("ignores an old lesson mutation and allows retry after a failure", async () => {
    const saved = deferred<{ saved: boolean }>(); mocks.save.mockReturnValueOnce(saved.promise);
    await render(<EducationPage />, "/education/lesson/A");
    await act(async () => { host.querySelector<HTMLButtonElement>(".lesson-top > button:last-child")!.click(); });
    await render(<EducationPage />, "/education/lesson/B");
    await act(async () => { saved.resolve({ saved: true }); });
    expect(host.querySelector(".lesson-top > button:last-child")?.textContent).toContain("education.saveLesson");
    mocks.complete.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { host.querySelector<HTMLButtonElement>(".lesson-complete")!.click(); });
    expect(mocks.show).toHaveBeenCalledWith("offline", "error");
    expect(host.querySelector<HTMLButtonElement>(".lesson-complete")!.disabled).toBe(false);
  });
  it("loads later lessons, deduplicates them and resets pagination for a new search", async () => {
    mocks.videos.mockImplementation(async options => ({ items: options.page === 2 ? [video("first"), video("later")] : [video(options.q || "first")], hasMore: options.page !== 2 }));
    await render(<EducationPage />); await tick();
    await act(async () => { host.querySelector<HTMLButtonElement>(".education-more")!.click(); }); await tick();
    expect(host.querySelectorAll(".education-video-card")).toHaveLength(2);
    expect(host.textContent).toContain("Lesson later");
    await type(host.querySelector<HTMLInputElement>(".education-toolbar input")!, "new"); await tick();
    expect(mocks.videos).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, q: "new" }));
    expect(host.textContent).not.toContain("Lesson later");
  });
  it("reports a search failure instead of showing old results and retries the failed query", async () => {
    await render(<EducationPage />); await tick();
    mocks.videos.mockRejectedValueOnce(new Error("offline"));
    await type(host.querySelector<HTMLInputElement>(".education-toolbar input")!, "retry me"); await tick();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("offline");
    expect(host.querySelector(".education-empty")).toBeNull();
    mocks.videos.mockResolvedValue({ items: [video("retried")], hasMore: false });
    await act(async () => { host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click(); }); await tick();
    expect(host.textContent).toContain("Lesson retried"); expect(host.querySelector('[role="alert"]')).toBeNull();
  });
  it("keeps the latest search results when older requests finish last", async () => {
    const old = deferred<{ items: unknown[] }>();
    mocks.videos.mockImplementation(async options => options.q === "old" ? old.promise : { items: [video(options.q ?? "initial")] });
    await render(<EducationPage />); await tick();
    const input = host.querySelector<HTMLInputElement>(".education-toolbar input")!;
    await type(input, "old"); await tick(); await type(input, "new"); await tick();
    await act(async () => { old.resolve({ items: [video("old")] }); });
    expect(host.querySelector(".education-video-grid")?.textContent).toContain("Lesson new");
    expect(host.querySelector(".education-video-grid")?.textContent).not.toContain("Lesson old");
  });
  it("ignores the previous subject after a new one is selected", async () => {
    const old = deferred<{ items: unknown[] }>();
    mocks.videos.mockImplementation(async options => options.subject === "ielts" ? old.promise : { items: [video("math")] });
    await render(<EducationPage />); await tick();
    await act(async () => { host.querySelectorAll<HTMLButtonElement>(".education-subjects button")[1].click(); }); await tick();
    await act(async () => { old.resolve({ items: [video("english")] }); });
    expect(host.querySelector(".education-video-grid")?.textContent).toContain("Lesson math");
    expect(host.querySelector(".education-video-grid")?.textContent).not.toContain("Lesson english");
  });
  it("retains a new note and blocks duplicate saves", async () => {
    const saved = deferred<unknown>(); mocks.addNote.mockReturnValue(saved.promise);
    await render(<EducationPage />, "/education/lesson/A"); await type(note(), "first note");
    await act(async () => { const button = host.querySelector<HTMLButtonElement>(".lesson-notes button")!; button.click(); button.click(); });
    expect(mocks.addNote).toHaveBeenCalledTimes(1);
    await type(note(), "new note"); await act(async () => { saved.resolve({}); });
    expect(note().value).toBe("new note");
    mocks.addNote.mockResolvedValue({});
    await act(async () => { host.querySelector<HTMLButtonElement>(".lesson-notes button")!.click(); });
    expect(mocks.addNote).toHaveBeenLastCalledWith("A", "new note"); expect(note().value).toBe("");
  });
  it("keeps a failed note available for retry and reports the error", async () => {
    mocks.addNote.mockRejectedValue(new Error("offline"));
    await render(<EducationPage />, "/education/lesson/A"); await type(note(), "keep me");
    await act(async () => { host.querySelector<HTMLButtonElement>(".lesson-notes button")!.click(); });
    expect(note().value).toBe("keep me"); expect(mocks.show).toHaveBeenCalledWith("offline", "error");
    expect(host.querySelector<HTMLButtonElement>(".lesson-notes button")!.disabled).toBe(false);
  });
  it("blocks repeated Enter while the mentor is busy without erasing the next question", async () => {
    const answer = deferred<{ reply: string }>(); mocks.mentor.mockReturnValue(answer.promise);
    await render(<EducationPage />, "/education/lesson/A"); await type(question(), "first question");
    await act(async () => { for (let i = 0; i < 2; i++) question().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(mocks.mentor).toHaveBeenCalledTimes(1);
    await type(question(), "next question"); await act(async () => { answer.resolve({ reply: "first answer" }); });
    expect(question().value).toBe("next question");
    mocks.mentor.mockResolvedValue({ reply: "next answer" });
    await act(async () => { question().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(mocks.mentor).toHaveBeenLastCalledWith("A", "next question"); expect(question().value).toBe("");
  });
  it("does not submit IME confirmation or Shift+Enter", async () => {
    await render(<EducationPage />, "/education/lesson/A"); await type(question(), "question");
    await act(async () => {
      question().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
      question().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    });
    expect(mocks.mentor).not.toHaveBeenCalled();
  });
  it("ignores note and mentor responses belonging to a previous lesson", async () => {
    const saved = deferred<unknown>(); const answer = deferred<{ reply: string }>();
    mocks.addNote.mockReturnValue(saved.promise); mocks.mentor.mockReturnValue(answer.promise);
    await render(<EducationPage />, "/education/lesson/A"); await type(note(), "A note"); await type(question(), "A question");
    await act(async () => { host.querySelector<HTMLButtonElement>(".lesson-notes button")!.click(); host.querySelector<HTMLButtonElement>(".mentor-input button")!.click(); });
    await render(<EducationPage />, "/education/lesson/B"); await type(note(), "B draft");
    await act(async () => { saved.resolve({}); answer.resolve({ reply: "A answer" }); });
    expect(note().value).toBe("B draft"); expect(host.querySelector(".mentor-answer")?.textContent).not.toContain("A answer");
  });
});

describe("YouTube opening lifecycle", () => {
  it("serializes likes and restores the button after errors", async () => {
    mocks.params = { slug: "watch" };
    const liked = deferred<{ liked: boolean; likes: number }>(); mocks.like.mockReturnValueOnce(liked.promise);
    await render(<YoutubePage />, "/youtube/watch");
    await act(async () => { const button = host.querySelector<HTMLButtonElement>(".yt-like")!; button.click(); button.click(); });
    expect(mocks.like).toHaveBeenCalledTimes(1); expect(mocks.unlike).not.toHaveBeenCalled();
    await act(async () => { liked.resolve({ liked: true, likes: 1 }); });
    expect(host.querySelector(".yt-like")?.getAttribute("aria-pressed")).toBe("true");
    mocks.unlike.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { host.querySelector<HTMLButtonElement>(".yt-like")!.click(); });
    expect(host.querySelector(".yt-like")?.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector<HTMLButtonElement>(".yt-like")!.disabled).toBe(false);
  });
  async function open() {
    await render(<YoutubePage />, "/youtube");
    await act(async () => { host.querySelector<HTMLButtonElement>(".youtube-video")!.click(); });
  }
  it("does not navigate after leaving the page", async () => {
    const opened = deferred<unknown>(); mocks.openVideo.mockReturnValue(opened.promise);
    await open(); await render(<div>Education</div>, "/education");
    await act(async () => { opened.resolve({ slug: "old-video" }); });
    expect(mocks.navigate).not.toHaveBeenCalled(); expect(host.textContent).toBe("Education");
  });
  it("does not show an old opening error on another page", async () => {
    const opened = deferred<unknown>(); mocks.openVideo.mockReturnValue(opened.promise);
    await open(); await render(<div>Education</div>, "/education");
    await act(async () => { opened.reject(new Error("offline")); });
    expect(mocks.show).not.toHaveBeenCalled();
  });
  it("still opens a video while staying on the page", async () => {
    await open(); expect(mocks.navigate).toHaveBeenCalledWith("/youtube/watch");
  });
  it("cancels an old opening when the user starts a different search", async () => {
    const opened = deferred<unknown>(); mocks.openVideo.mockReturnValue(opened.promise);
    await open(); await type(host.querySelector<HTMLInputElement>(".youtube-search input")!, "new search");
    await act(async () => { host.querySelector(".youtube-search")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => { opened.resolve({ slug: "old-video" }); });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

describe("service usage routes", () => {
  it.each(["/meet/abc-defg-hij", "/meetings", "/meetings/meeting-id"])("records visits and active time on %s", async path => {
    await render(<UsageTracker />, path);
    expect(mocks.recordUsage).toHaveBeenCalledWith("me", "meetings", 0, 1);
    await tick(10000);
    expect(mocks.recordUsage).toHaveBeenLastCalledWith("me", "meetings", 10);
  });
  it.each([["/education", "education"], ["/library/book/read", "library"], ["/u/1234567", "chat"], ["/g/123", "chat"]])("preserves the classification of %s", async (path, service) => {
    await render(<UsageTracker />, path); expect(mocks.recordUsage).toHaveBeenCalledWith("me", service, 0, 1);
  });
  it("does not treat unrelated route prefixes as a meeting", async () => {
    await render(<UsageTracker />, "/meeting-settings"); expect(mocks.recordUsage).not.toHaveBeenCalled();
  });
});
