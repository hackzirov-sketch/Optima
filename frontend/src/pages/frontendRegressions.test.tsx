// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";
import { AiPage } from "./AiPage";
import { ProfilePage } from "./ProfilePage";
import { UserProfileModal } from "../components/UserProfileModal";
import { MeetingChat } from "../components/MeetingChat";
import { useMeetingChat } from "../lib/meetingChat";
import { closeProfile, openProfile } from "../lib/profileModal";
import { LiveKitMeeting } from "../lib/liveKitMeeting";
import { ConnectionState } from "livekit-client";

const mocks = vi.hoisted(() => {
  const user = { id: "me", publicId: 7777777, firstName: "Test", lastName: "User", email: "test@example.invalid", phoneNumber: 998901234567, notificationsEnabled: true, emailNotifications: true, pushNotifications: true, notifyMentions: true };
  const rooms = ["A", "B"].map(id => ({ id, name: id, type: "group", memberIds: ["me"], memberProfiles: [], memberStatus: "active", memberCount: 1, unreadCount: 0, createdById: "me", role: "owner", scope: "public" }));
  const empty = () => Promise.resolve([]);
  const chat = {
    rooms: vi.fn(async () => rooms), community: vi.fn(async () => ({})),
    messages: vi.fn(async (_id: string, _before?: number): Promise<{ data: unknown[]; total: number }> => ({ data: [], total: 0 })),
    readReceipts: vi.fn(empty), drafts: vi.fn(empty), pins: vi.fn(empty),
    joinRequests: vi.fn(empty),
    inviteCode: vi.fn(async () => ({ code: "test-invite" })),
    discover: vi.fn(async (_query: string): Promise<unknown[]> => []),
    roomMembers: vi.fn(async (_room: string, _query?: string): Promise<{ items: unknown[]; total: number }> => ({ items: [], total: 0 })),
    shared: vi.fn(async (_room: string, _tab: string): Promise<unknown[]> => []),
    voiceChat: vi.fn(async () => null), voiceChatScheduled: vi.fn(async () => null),
    resolveRoute: vi.fn(async (_workspace: string, _type: string, id: string) => ({ roomId: id })),
    send: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({})),
    editMessage: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({})),
    uploadChatFile: vi.fn(async (_room: string, file: File) => ({ storageKey: file.name, storageUrl: `/files/${file.name}`, fileName: file.name, fileSize: file.size, mimeType: file.type })),
    aiConversations: vi.fn(empty), aiConversation: vi.fn(async (_id: string) => ({ messages: [] })),
    ai: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ reply: "answer", conversationId: "created" })),
  };
  return {
    user, rooms, chat, show: vi.fn(), navigate: vi.fn(), refreshUser: vi.fn(async () => {}), updateUser: vi.fn(async (_patch: unknown) => ({})), params: {} as { id?: string },
    sessions: vi.fn(async (): Promise<Array<{ id: string; createdAt: string }>> => []),
    revokeSession: vi.fn(async (_id: string) => ({})),
    settings: vi.fn(async (_patch: unknown) => ({})),
    searchUsers: vi.fn(async (_query: string): Promise<{ data: unknown[] }> => ({ data: [] })),
    isRoomE2ee: vi.fn(async (_id: string) => false),
    t: (key: string) => key,
    socket: { connected: false, on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    publicProfile: vi.fn(async () => ({ ...user, id: "other", publicId: 1234567, username: "other", channels: [] })),
  };
});

vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: mocks.user, group: { id: "workspace" }, refreshUser: mocks.refreshUser, logout: vi.fn() }) }));
vi.mock("../lib/i18n/i18n", () => ({ useI18n: () => ({ t: mocks.t, locale: "en" }) }));
vi.mock("../components/Toast", () => ({ useToast: () => ({ show: mocks.show }) }));
vi.mock("../components/ConfirmDialog", () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock("wouter", () => ({ useLocation: () => ["/chat", mocks.navigate], useSearch: () => "", useParams: () => mocks.params }));
vi.mock("../lib/api", () => ({ api: { chat: mocks.chat, groups: { members: async () => [] }, users: { search: mocks.searchUsers, publicProfile: mocks.publicProfile, update: mocks.updateUser, settings: mocks.settings }, auth: { sessions: mocks.sessions, revokeSession: mocks.revokeSession } } }));
vi.mock("../lib/socket", () => ({ getSocket: () => mocks.socket, emitWithAck: vi.fn(), isServerRejection: () => false }));
vi.mock("../lib/drafts", () => ({ DRAFT_CLIENT_ID: "test", openDraft: vi.fn(), saveDraft: vi.fn(async () => {}) }));
vi.mock("../lib/presence", () => ({ usePresence: () => null, initPresence: vi.fn(), isPresenceActive: () => false, formatPresenceLabel: () => "offline" }));
vi.mock("../lib/e2ee", () => ({
  decryptEnvelope: vi.fn(), decryptMessage: async (value: unknown) => value, decryptMessages: async (value: unknown) => value,
  invalidateAllRooms: vi.fn(), isRoomE2ee: mocks.isRoomE2ee, invalidateRoom: vi.fn(), sendWithE2ee: vi.fn(), serveRoomKeys: () => () => {}, UNDECRYPTABLE_TEXT: "encrypted",
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
async function input(node: HTMLTextAreaElement | HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value);
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
  mocks.user = { ...mocks.user, id: "me", firstName: "Test", lastName: "User", notificationsEnabled: true, emailNotifications: true, pushNotifications: true, notifyMentions: true };
  mocks.sessions.mockResolvedValue([]); mocks.revokeSession.mockResolvedValue({});
  mocks.settings.mockResolvedValue({}); mocks.refreshUser.mockResolvedValue();
  mocks.isRoomE2ee.mockResolvedValue(false); mocks.searchUsers.mockResolvedValue({ data: [] });
  mocks.chat.discover.mockResolvedValue([]); mocks.chat.roomMembers.mockResolvedValue({ items: [], total: 0 }); mocks.chat.shared.mockResolvedValue([]);
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

describe("message edit ownership", () => {
  async function editMessage() {
    mocks.chat.messages.mockImplementation(async id => ({ data: [{ ...message(id), senderId: "me" }], total: 1 }));
    await render(chat("A"));
    await act(async () => { host.querySelector<HTMLButtonElement>(".message-menu-trigger")!.click(); });
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>("[role='menuitem']")].find(button => button.textContent?.includes("chat.editAction"))!.click(); });
  }
  it("preserves newer text when an edit finishes and allows saving that revision", async () => {
    const edited = deferred<unknown>(); mocks.chat.editMessage.mockReturnValue(edited.promise);
    await editMessage(); await input(composer(), "edit one"); await sendChat();
    await input(composer(), "edit two");
    await act(async () => { edited.resolve({ ...message("A"), senderId: "me", content: "edit one" }); });
    expect(composer().value).toBe("edit two");
    mocks.chat.editMessage.mockResolvedValue({ ...message("A"), senderId: "me", content: "edit two" });
    await sendChat();
    expect(mocks.chat.editMessage.mock.calls.at(-1)?.[1]).toBe("edit two");
    expect(composer().value).toBe("");
  });
  it("ignores an old edit after changing rooms", async () => {
    const edited = deferred<unknown>(); mocks.chat.editMessage.mockReturnValue(edited.promise);
    await editMessage(); await input(composer(), "A edit"); await sendChat();
    await render(chat("B")); await input(composer(), "B draft");
    await act(async () => { edited.resolve({ ...message("A"), senderId: "me", content: "A edit" }); });
    expect(composer().value).toBe("B draft");
  });
});

describe("AI navigation", () => {
  it("keeps a new draft and retries a failed question without replacing it", async () => {
    const reply = deferred<unknown>(); mocks.chat.ai.mockReturnValue(reply.promise);
    await render(<AiPage />); await input(host.querySelector("textarea")!, "first question");
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await input(host.querySelector("textarea")!, "second draft");
    await act(async () => { reply.reject(new Error("offline")); });
    expect(host.querySelector("textarea")!.value).toBe("second draft");
    expect(host.querySelector(".standalone-ai-message")?.textContent).toContain("first question");
    expect(host.querySelector(".ai-message-retry")).not.toBeNull();
    mocks.chat.ai.mockResolvedValue({ reply: "answer" });
    await act(async () => { host.querySelector<HTMLButtonElement>(".ai-message-retry")!.click(); });
    expect(mocks.chat.ai.mock.calls.at(-1)?.[0]).toBe("first question");
    expect(host.querySelector("textarea")!.value).toBe("second draft");
    expect(host.querySelector(".ai-message-retry")).toBeNull();
  });
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

describe("chat delayed responses", () => {
  async function pause() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 310)); }); }
  it("does not stage a file after the room changes during its encryption check", async () => {
    const checked = deferred<boolean>(); mocks.isRoomE2ee.mockReturnValueOnce(checked.promise);
    await render(chat("A"));
    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;
    await act(async () => {
      Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["secret"], "private.txt", { type: "text/plain" })] });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await render(chat("B"));
    await act(async () => { checked.resolve(false); });
    expect(mocks.chat.uploadChatFile).not.toHaveBeenCalled();
    expect(host.querySelector(".composer-staged")).toBeNull();
  });
  it.each(["new text", "different chat"])("does not overwrite %s with an old composer AI answer", async mode => {
    const answer = deferred<unknown>(); mocks.chat.ai.mockReturnValueOnce(answer.promise);
    await render(chat("A")); await input(composer(), "/ai draft");
    await input(host.querySelector<HTMLTextAreaElement>(".ai-assist-input textarea")!, "improve this");
    await act(async () => { host.querySelector<HTMLFormElement>(".composer-ai-assist")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    if (mode === "different chat") await render(chat("B"));
    await input(composer(), "keep my new draft");
    await act(async () => { answer.resolve({ reply: "old AI answer" }); });
    expect(composer().value).toBe("keep my new draft");
  });
  it("ignores old sidebar searches after a new query and after clearing", async () => {
    const old = deferred<{ data: unknown[] }>(); const oldRooms = deferred<unknown[]>();
    mocks.searchUsers.mockImplementation(async query => query === "old" ? old.promise : { data: [{ id: "new", firstName: "Fresh", lastName: "Person", publicId: 123 }] });
    mocks.chat.discover.mockImplementation(async query => query === "old" ? oldRooms.promise : []);
    await render(chat("A"));
    const search = host.querySelector<HTMLInputElement>('input[aria-label="chat.searchChatPlaceholder"]')!;
    await input(search, "old"); await pause(); await input(search, "new"); await pause();
    await act(async () => { old.resolve({ data: [{ id: "old", firstName: "Stale", lastName: "Person" }] }); oldRooms.resolve([]); });
    expect(host.textContent).toContain("Fresh"); expect(host.textContent).not.toContain("Stale");
    await input(search, ""); await pause();
    expect(host.textContent).not.toContain("Fresh");
  });
  it("ignores old members when another room profile opens", async () => {
    const old = deferred<{ items: unknown[]; total: number }>();
    mocks.chat.roomMembers.mockImplementation(async room => room === "A" ? old.promise : { items: [{ id: "fresh", publicId: 123, firstName: "Fresh", lastName: "Member", role: "member" }], total: 1 });
    await render(chat("A"));
    await act(async () => { host.querySelector<HTMLButtonElement>(".conversation-title")!.click(); });
    await render(chat("B"));
    await act(async () => { old.resolve({ items: [{ id: "old", publicId: 456, firstName: "Stale", lastName: "Member", role: "member" }], total: 1 }); });
    expect(document.querySelector(".tg-info-modal")?.textContent).toContain("Fresh");
    expect(document.querySelector(".tg-info-modal")?.textContent).not.toContain("Stale");
  });
  it("keeps the latest member picker results when an older search finishes last", async () => {
    const old = deferred<{ data: unknown[] }>();
    mocks.searchUsers.mockImplementation(async query => query === "old" ? old.promise : { data: [{ id: "fresh", firstName: "Fresh", lastName: "Person", email: "fresh@example.invalid" }] });
    await render(chat("A"));
    await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="chat.newConversationAria"]')!.click(); });
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.includes("chat.newMessageItem"))!.click(); });
    const search = document.querySelector<HTMLInputElement>('input[aria-label="chat.searchUserAria"]')!;
    await input(search, "old"); await pause(); await input(search, "new"); await pause();
    await act(async () => { old.resolve({ data: [{ id: "stale", firstName: "Stale", lastName: "Person" }] }); });
    expect(document.querySelector(".tg-new-members")?.textContent).toContain("Fresh");
    expect(document.querySelector(".tg-new-members")?.textContent).not.toContain("Stale");
  });
  it("still applies an AI answer to an unchanged draft", async () => {
    mocks.chat.ai.mockResolvedValueOnce({ reply: "Improved draft" });
    await render(chat("A")); await input(composer(), "/ai draft");
    await input(host.querySelector<HTMLTextAreaElement>(".ai-assist-input textarea")!, "improve");
    await act(async () => { host.querySelector<HTMLFormElement>(".composer-ai-assist")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(composer().value).toBe("Improved draft");
  });
});

describe("profile refresh and sessions", () => {
  it.each([[390, 72], [1360, 0]])("keeps a focused editor above the save panel at width %s without moving desktop", async (width, expectedScroll) => {
    vi.stubGlobal("innerWidth", width);
    host.className = "app-main";
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = this.classList.contains("tgp-savebar") ? 200 : this.matches(".tgp-row-edit input") ? 216 : 0;
      const height = this.matches(".tgp-row-edit input") ? 44 : 60;
      return { top, bottom: top + height, left: 0, right: 300, x: 0, y: top, width: 300, height, toJSON() {} };
    });
    await render(<ProfilePage />);
    await act(async () => { host.querySelector<HTMLButtonElement>(".tgp-row-main")!.click(); });
    const editor = host.querySelector<HTMLInputElement>('input[aria-label="profile.firstNameLabel"]')!;
    editor.focus();
    await input(editor, "Unsaved draft");
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
    expect(host.scrollTop).toBe(expectedScroll);
  });
  async function openSection(key: string) {
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>(".tgp-nav button")].find(button => button.textContent?.includes(key))!.click(); });
  }
  it("refreshes untouched fields without overwriting an edited field", async () => {
    await render(<ProfilePage />);
    await act(async () => { host.querySelector<HTMLButtonElement>(".tgp-row-main")!.click(); });
    await input(host.querySelector<HTMLInputElement>('input[aria-label="profile.firstNameLabel"]')!, "My draft");
    mocks.user = { ...mocks.user, firstName: "Server name", lastName: "Updated" };
    await render(<ProfilePage />);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="profile.firstNameLabel"]')!.value).toBe("My draft");
    expect(host.querySelector<HTMLInputElement>('input[aria-label="profile.lastNameLabel"]')!.value).toBe("Updated");
    await act(async () => { document.querySelector<HTMLButtonElement>(".tgp-savebar button")!.click(); });
    expect(host.querySelector(".tgp-name")?.textContent).toContain("Server name Updated");
    expect(document.querySelector(".tgp-savebar")).toBeNull();
  });
  it("does not create unsaved edits when a clean profile refreshes", async () => {
    await render(<ProfilePage />);
    mocks.user = { ...mocks.user, firstName: "Fresh" };
    await render(<ProfilePage />);
    expect(host.querySelector(".tgp-name")?.textContent).toContain("Fresh");
    expect(document.querySelector(".tgp-savebar")).toBeNull();
  });
  it("syncs notification switches and sends the opposite of the refreshed value", async () => {
    await render(<ProfilePage />); await openSection("profile.tabNotifications");
    mocks.user = { ...mocks.user, emailNotifications: false };
    await render(<ProfilePage />);
    const button = host.querySelector<HTMLButtonElement>('[aria-label="profile.emailNotifications"]')!;
    expect(button.getAttribute("aria-checked")).toBe("false");
    await act(async () => { button.click(); });
    expect(mocks.settings).toHaveBeenCalledWith({ emailNotifications: true });
  });
  it("shows a sessions loading error and retries instead of claiming no sessions", async () => {
    mocks.sessions.mockRejectedValueOnce(new Error("offline"));
    await render(<ProfilePage />); await openSection("profile.tabSessions");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("offline");
    expect(host.querySelector(".compact-empty")).toBeNull();
    mocks.sessions.mockResolvedValue([{ id: "current", createdAt: "2026-10-18T00:00:00Z" }]);
    await act(async () => { host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click(); });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelectorAll(".session-row")).toHaveLength(1);
  });
  it("removes successful revocations even when another device fails, then retries only failures", async () => {
    mocks.sessions.mockResolvedValue(["current", "closed", "failed"].map(id => ({ id, createdAt: "2026-10-18T00:00:00Z" })));
    mocks.revokeSession.mockImplementation(async id => { if (id === "failed") throw new Error("offline"); return {}; });
    await render(<ProfilePage />); await openSection("profile.tabSessions");
    await act(async () => { host.querySelector<HTMLButtonElement>(".with-action button")!.click(); });
    expect(host.querySelectorAll(".session-row")).toHaveLength(2);
    expect(mocks.show).toHaveBeenLastCalledWith("offline", "error");
    mocks.revokeSession.mockClear(); mocks.revokeSession.mockResolvedValue({});
    await act(async () => { host.querySelector<HTMLButtonElement>(".with-action button")!.click(); });
    expect(mocks.revokeSession).toHaveBeenCalledTimes(1);
    expect(mocks.revokeSession).toHaveBeenCalledWith("failed");
    expect(host.querySelectorAll(".session-row")).toHaveLength(1);
  });
});

describe("profile phone validation", () => {
  async function phone(value: string) {
    await render(<ProfilePage />);
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>(".tgp-row-main")].find(button => button.textContent?.includes("profile.phoneLabel"))!.click(); });
    await input(host.querySelector<HTMLInputElement>("input[aria-label='profile.phoneLabel']")!, value);
    await act(async () => { document.querySelector<HTMLButtonElement>(".tgp-savebar .primary")!.click(); });
  }
  it("explains unsupported removal without a false success or an empty update", async () => {
    await phone("");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.show).toHaveBeenLastCalledWith("profile.phoneRemovalUnsupported", "error");
  });
  it("rejects a phone number outside the existing API range", async () => {
    await phone("123");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.show).toHaveBeenLastCalledWith("profile.phoneInvalid", "error");
  });
  it("still updates a valid replacement number", async () => {
    await phone("998909876543");
    expect(mocks.updateUser).toHaveBeenCalledWith({ phoneNumber: 998909876543 });
    expect(mocks.show).toHaveBeenLastCalledWith("profile.profileSaved");
  });
});
