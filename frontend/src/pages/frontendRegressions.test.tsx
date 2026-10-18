// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";
import { AiPage } from "./AiPage";
import { UserProfileModal } from "../components/UserProfileModal";
import { MeetingChat } from "../components/MeetingChat";
import { useMeetingChat } from "../lib/meetingChat";
import { closeProfile, openProfile } from "../lib/profileModal";
import { LiveKitMeeting } from "../lib/liveKitMeeting";
import { ConnectionState } from "livekit-client";

const mocks = vi.hoisted(() => {
  const user = { id: "me", publicId: 7777777, firstName: "Test", lastName: "User", email: "test@example.invalid" };
  const rooms = ["A", "B"].map(id => ({ id, name: id, type: "group", memberIds: ["me"], memberProfiles: [], memberStatus: "active", memberCount: 1, unreadCount: 0, createdById: "me", role: "owner", scope: "public" }));
  const empty = () => Promise.resolve([]);
  const chat = {
    rooms: vi.fn(async () => rooms), community: vi.fn(async () => ({})),
    messages: vi.fn(async (_id: string, _before?: number): Promise<{ data: unknown[]; total: number }> => ({ data: [], total: 0 })),
    readReceipts: vi.fn(empty), drafts: vi.fn(empty), pins: vi.fn(empty),
    joinRequests: vi.fn(empty),
    voiceChat: vi.fn(async () => null), voiceChatScheduled: vi.fn(async () => null),
    resolveRoute: vi.fn(async (_workspace: string, _type: string, id: string) => ({ roomId: id })),
    send: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({})),
    uploadChatFile: vi.fn(async (_room: string, file: File) => ({ storageKey: file.name, storageUrl: `/files/${file.name}`, fileName: file.name, fileSize: file.size, mimeType: file.type })),
    aiConversations: vi.fn(empty), aiConversation: vi.fn(async (_id: string) => ({ messages: [] })),
    ai: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ reply: "answer", conversationId: "created" })),
  };
  return {
    user, rooms, chat, show: vi.fn(), navigate: vi.fn(), params: {} as { id?: string },
    t: (key: string) => key,
    socket: { connected: false, on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    publicProfile: vi.fn(async () => ({ ...user, id: "other", publicId: 1234567, username: "other", channels: [] })),
  };
});

vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: mocks.user, group: { id: "workspace" }, logout: vi.fn() }) }));
vi.mock("../lib/i18n/i18n", () => ({ useI18n: () => ({ t: mocks.t, locale: "en" }) }));
vi.mock("../components/Toast", () => ({ useToast: () => ({ show: mocks.show }) }));
vi.mock("../components/ConfirmDialog", () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock("wouter", () => ({ useLocation: () => ["/chat", mocks.navigate], useSearch: () => "", useParams: () => mocks.params }));
vi.mock("../lib/api", () => ({ api: { chat: mocks.chat, groups: { members: async () => [] }, users: { publicProfile: mocks.publicProfile }, auth: {} } }));
vi.mock("../lib/socket", () => ({ getSocket: () => mocks.socket, emitWithAck: vi.fn(), isServerRejection: () => false }));
vi.mock("../lib/drafts", () => ({ DRAFT_CLIENT_ID: "test", openDraft: vi.fn(), saveDraft: vi.fn(async () => {}) }));
vi.mock("../lib/presence", () => ({ usePresence: () => null, initPresence: vi.fn(), isPresenceActive: () => false, formatPresenceLabel: () => "offline" }));
vi.mock("../lib/e2ee", () => ({
  decryptEnvelope: vi.fn(), decryptMessage: async (value: unknown) => value, decryptMessages: async (value: unknown) => value,
  invalidateAllRooms: vi.fn(), isRoomE2ee: async () => false, invalidateRoom: vi.fn(), sendWithE2ee: vi.fn(), serveRoomKeys: () => () => {}, UNDECRYPTABLE_TEXT: "encrypted",
}));
vi.mock("../components/StarfieldBackground", () => ({ StarfieldBackground: () => null }));
vi.mock("../components/AnimatedEmoji", () => ({ AnimatedEmoji: () => null }));
vi.mock("../components/EmojiPicker", () => ({ EmojiPickerButton: () => null }));
vi.mock("../components/ChannelSettingsPanel", () => ({ ChannelSettingsPanel: () => null }));
vi.mock("../components/RoomVoiceChat", () => ({ RoomVoiceChat: () => null }));
vi.mock("./MeetingRoomPage", () => ({ MeetingRoomPage: () => null }));
vi.mock("../components/RichMessageInput", () => ({ RichMessageInput: ({ value, onChange, onSubmit }: { value: string; onChange: (value: string) => void; onSubmit: () => void }) => <textarea data-testid="composer" value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter") onSubmit(); }} /> }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const message = (roomId: string) => ({ id: `message-${roomId}`, roomId, senderId: "other", content: `content-${roomId}`, sequence: 1, createdAt: new Date().toISOString(), reactions: [] });
let host: HTMLDivElement;
let root: Root;
async function render(node: ReactNode) { await act(async () => { root.render(node); }); }
async function input(node: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function sendChat() {
  await act(async () => { host.querySelector<HTMLTextAreaElement>("[data-testid='composer']")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
}
const composer = () => host.querySelector<HTMLTextAreaElement>("[data-testid='composer']")!;
const chat = (id: string) => <ChatPage routeTarget={{ type: "group", identifier: id }} />;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = {};
  mocks.chat.messages.mockImplementation(async () => ({ data: [], total: 0 }));
  mocks.chat.readReceipts.mockImplementation(async () => []);
  mocks.chat.send.mockImplementation(async () => ({}));
  window.history.replaceState({}, "", "/chat");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => { root.unmount(); closeProfile(); });
  host.remove();
  vi.unstubAllGlobals();
});

describe("chat request ownership", () => {
  it("ignores a previous room's late messages and read receipts", async () => {
    const a = deferred<{ data: unknown[]; total: number }>();
    const receipts = deferred<never[]>();
    mocks.chat.messages.mockImplementation(async id => id === "A" ? a.promise : { data: [message("B")], total: 1 });
    mocks.chat.readReceipts.mockImplementationOnce(() => receipts.promise);
    await render(chat("A")); await render(chat("B"));
    expect(host.textContent).toContain("content-B");
    await act(async () => { a.resolve({ data: [message("A")], total: 1 }); receipts.resolve([]); });
    expect(host.textContent).toContain("content-B");
    expect(host.textContent).not.toContain("content-A");
  });

  it("keeps late pagination out of a different room", async () => {
    const older = deferred<{ data: unknown[]; total: number }>();
    mocks.chat.messages.mockImplementation(async (id, before) => before ? older.promise : { data: [message(id)], total: id === "A" ? 81 : 1 });
    await render(chat("A"));
    await act(async () => { host.querySelector(".message-list")!.dispatchEvent(new Event("scroll", { bubbles: true })); });
    await render(chat("B"));
    await act(async () => { older.resolve({ data: [message("old-A")], total: 1 }); });
    expect(host.textContent).toContain("content-B");
    expect(host.textContent).not.toContain("content-old-A");
  });

  it("preserves newly typed text after an earlier send fails", async () => {
    const sent = deferred<unknown>(); mocks.chat.send.mockReturnValue(sent.promise);
    await render(chat("A")); await input(composer(), "first"); await sendChat();
    await input(composer(), "second");
    await act(async () => { sent.reject(new Error("offline")); });
    expect(composer().value).toBe("second");
    expect(host.querySelector(".chat-send-failure")?.textContent).toContain("first");
  });

  it("restores failed files and text only in their original room", async () => {
    const sent = deferred<unknown>(); mocks.chat.send.mockReturnValue(sent.promise);
    await render(chat("A"));
    const fileInput = host.querySelector<HTMLInputElement>("input[type='file'][multiple]")!;
    expect(fileInput).not.toBeNull();
    await act(async () => {
      Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["test"], "test.txt", { type: "text/plain" })] });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await input(composer(), "first"); await sendChat();
    await render(chat("B")); await input(composer(), "B draft");
    await act(async () => { sent.reject(new Error("offline")); });
    expect(composer().value).toBe("B draft");
    expect(host.querySelector(".composer-staged")).toBeNull();
    await render(chat("A"));
    expect(composer().value).toBe("");
    expect(host.querySelector(".chat-send-failure")?.textContent).toContain("first");
    expect(host.querySelector(".chat-send-failure")?.textContent).toContain("test.txt");
    const originalId = mocks.chat.send.mock.calls[0][2];
    mocks.chat.send.mockResolvedValue({ ...message("A"), senderId: "me", content: "first", clientMessageId: originalId });
    await act(async () => { host.querySelector<HTMLButtonElement>(".chat-send-failure button")!.click(); });
    expect(mocks.chat.send.mock.calls.at(-1)?.[2]).toBe(originalId);
    expect(mocks.chat.send.mock.calls.at(-1)?.[4]).toEqual([expect.objectContaining({ fileName: "test.txt" })]);
    expect(host.querySelector(".chat-send-failure")).toBeNull();
  });
});

describe("AI navigation", () => {
  it("does not reopen AI when a reply arrives after leaving the page", async () => {
    const reply = deferred<unknown>(); mocks.chat.ai.mockReturnValue(reply.promise);
    await render(<AiPage />);
    await input(host.querySelector("textarea")!, "question");
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await render(<div>Library</div>);
    await act(async () => { reply.resolve({ reply: "answer", conversationId: "old" }); });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(host.textContent).toBe("Library");
  });
  it("still opens the created conversation when the user stays on AI", async () => {
    mocks.chat.ai.mockResolvedValue({ reply: "answer", conversationId: "created" });
    await render(<AiPage />); await input(host.querySelector("textarea")!, "question");
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mocks.navigate).toHaveBeenCalledWith("/ai/created", { replace: true });
  });
});

describe("meeting chat delivery", () => {
  it("does not append a message refused by the transport", async () => {
    let session!: ReturnType<typeof useMeetingChat>;
    function Harness() { session = useMeetingChat("meeting", "me"); return null; }
    await render(<Harness />);
    await act(async () => { session.setTransport(async () => 0, 2); });
    let result: number | undefined;
    await act(async () => { result = await session.send("hello"); });
    expect(result).toBe(0); expect(session.messages).toEqual([]);
    await act(async () => { session.setTransport(async () => { throw new Error("offline"); }, 2); result = await session.send("again"); });
    expect(result).toBe(0); expect(session.messages).toEqual([]);
  });
  it("retains input and displays an error after asynchronous failure", async () => {
    const send = vi.fn(async () => 0);
    await render(<MeetingChat messages={[]} connected={2} selfId="me" nameFor={id => id} open onOpen={() => {}} onSend={send} />);
    await input(host.querySelector("textarea")!, "hello");
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(host.querySelector("textarea")!.value).toBe("hello");
    expect(host.querySelector("[role='alert']")).not.toBeNull();
  });
  it("does not erase newly typed text while publication is pending", async () => {
    const sent = deferred<number>();
    const send = vi.fn(() => sent.promise);
    await render(<MeetingChat messages={[]} connected={2} selfId="me" nameFor={id => id} open onOpen={() => {}} onSend={send} />);
    await input(host.querySelector("textarea")!, "first");
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(send).toHaveBeenCalledTimes(1);
    await input(host.querySelector("textarea")!, "second");
    await act(async () => { sent.resolve(1); });
    expect(host.querySelector("textarea")!.value).toBe("second");
  });
  it("rejects a blocked peer channel but accepts an empty room after the peer leaves", async () => {
    let session!: ReturnType<typeof useMeetingChat>;
    function Harness() { session = useMeetingChat("meeting", "me"); return null; }
    const channel = { readyState: "open", bufferedAmount: 65000, send: vi.fn(), close: vi.fn(), onmessage: null as ((event: { data: string }) => void) | null };
    await render(<Harness />);
    await act(async () => {
      session.attach({ createDataChannel: () => channel } as unknown as RTCPeerConnection, "peer");
      channel.onmessage!({ data: "optima-chat-ready-v1" });
    });
    let result: number | undefined;
    await act(async () => { result = await session.send("blocked"); });
    expect(result).toBe(0); expect(session.messages).toEqual([]);
    await act(async () => { session.detach("peer"); result = await session.send("local"); });
    expect(result).toBe(1); expect(session.messages[0]?.text).toBe("local");
    expect(channel.close).toHaveBeenCalledOnce();
  });
  it("discards an old publication after changing meetings", async () => {
    let session!: ReturnType<typeof useMeetingChat>;
    function Harness({ id }: { id: string }) { session = useMeetingChat(id, "me"); return null; }
    const sent = deferred<number>();
    await render(<Harness id="A" />);
    await act(async () => { session.setTransport(() => sent.promise, 1); });
    let pending!: Promise<number>;
    await act(async () => { pending = session.send("A message"); });
    await render(<Harness id="B" />);
    await act(async () => { sent.resolve(1); await pending; });
    expect(await pending).toBe(0); expect(session.messages).toEqual([]);
  });
  it("waits for LiveKit publication and propagates a failure", async () => {
    const publish = deferred<void>();
    const transport = Object.create(LiveKitMeeting.prototype) as LiveKitMeeting;
    Object.assign(transport, { enc: new TextEncoder(), room: { state: ConnectionState.Connected, remoteParticipants: new Map([["other", {}]]), localParticipant: { publishData: () => publish.promise } } });
    const result = transport.sendChat("hello");
    const rejected = expect(result).rejects.toThrow("offline");
    publish.reject(new Error("offline")); await rejected;
  });
  it("accepts an empty connected SFU room but refuses a disconnected one", async () => {
    const transport = Object.create(LiveKitMeeting.prototype) as LiveKitMeeting;
    const room = { state: ConnectionState.Connected, remoteParticipants: new Map(), localParticipant: { publishData: vi.fn() } };
    Object.assign(transport, { room });
    expect(await transport.sendChat("local")).toBe(1);
    room.state = ConnectionState.Disconnected;
    expect(await transport.sendChat("offline")).toBe(0);
    expect(room.localParticipant.publishData).not.toHaveBeenCalled();
  });
});

describe("profile keyboard focus", () => {
  it("focuses the dialog, traps Tab in both directions and restores focus", async () => {
    const trigger = document.createElement("button"); document.body.append(trigger); trigger.focus();
    await render(<UserProfileModal />);
    await act(async () => { openProfile("other"); });
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
    const modal = document.querySelector<HTMLElement>(".upm")!;
    expect(document.activeElement).toBe(modal);
    const buttons = modal.querySelectorAll<HTMLButtonElement>("button");
    buttons[buttons.length - 1].focus();
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.querySelector(".upm")).toBeNull(); expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
