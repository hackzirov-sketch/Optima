const now = () => new Date().toISOString();
const aiConversations: Array<{ id: string; title: string; updatedAt: string; messages: Array<{ id: string; role: string; text: string; hasImage: boolean; sources: unknown[]; createdAt: string }> }> = [];
let aiMemory = { content: "", enabled: true, updatedAt: null as string | null };
const user = { id: "local-user", publicId: "1000001", firstName: "Ahmadjon", lastName: "Zokirov", nickname: "Ahmadjon", username: "ahmadjon", email: "local@example.test", theme: "dark", language: "uz", isVerified: true };
if (isDemoMode()) Object.assign(user, { id: "demo-visitor", firstName: "Mehmon", lastName: "", nickname: "Mehmon", username: "demo", email: "demo@example.invalid" });
const colleague = { id: "local-colleague", publicId: "1000002", firstName: "Ali", lastName: "", username: "ali", avatarUrl: null };
const group = { id: "local-workspace", ownerId: user.id, name: "OPTIMA", slug: "local", visibility: "private" };
const room = { id: "local-room", groupId: group.id, type: "group", scope: "public", e2ee: false, name: "Dizayn jamoasi", memberIds: [user.id, colleague.id], memberProfiles: [user, colleague], createdById: user.id, memberCount: 2, unreadCount: 0, isReadOnly: false, myRole: "owner", publicId: 123456, createdAt: now(), lastMessage: null };
const rooms: Record<string, unknown>[] = [room, { ...room, id: "local-general", name: "general", publicId: 234567 }];
const messages: Record<string, unknown>[] = [
  { id: "local-message-1", roomId: room.id, senderId: colleague.id, content: "Assalomu alaykum! Dizaynni shu yerda sinab ko'rishingiz mumkin.", sequence: 1, sender: colleague, createdAt: now(), reactions: [] },
  { id: "local-message-2", roomId: room.id, senderId: user.id, content: "Matn va emoji bilan yozish maydonini tekshiramiz.", sequence: 2, sender: user, createdAt: now(), reactions: [] },
  { id: "local-message-3", roomId: room.id, senderId: user.id, content: "[[optima-emoji:p1-0001]]", sequence: 3, sender: user, createdAt: now(), reactions: [] },
];
const meeting = { id: "11111111-1111-4111-8111-111111111111", groupId: group.id, hostId: user.id, host: user, title: "Dizayn muhokamasi", code: "abc-defg-hij", status: "scheduled", scope: "group_only", joinPolicy: "auto", locked: false, startTime: now(), maxParticipants: 8, participantCount: 0, participants: [], access: { isHost: true, isParticipant: false, canJoin: true, canRequest: false, requestStatus: null } };
const demoBooks = ["Hikoyalar", "Ilm va izlanish", "Yangi so‘zlar"].map((title, index) => ({ key: `demo-book-${index}`, id: `demo-book-${index}`, title, authors: ["OPTIMA Demo"], languages: ["uz"], year: null, downloads: 0, description: "Kutubxona ko‘rinishi uchun namuna. To‘liq katalog hisobga kirgandan keyin ochiladi.", cover: "", embedUrl: null, textUrl: null, sourceUrl: "", source: "openlibrary", readable: true }));

// Unknown requests never fall through to the real backend in this preview.
export async function localPreviewRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = new URL(path, "http://localhost");
  const p = url.pathname;
  const method = options.method ?? "GET";
  const body: Record<string, unknown> = typeof options.body === "string" ? JSON.parse(options.body) : {};
  let data: unknown = [];
  if (p === "/users/me") {
    if (method === "PATCH") Object.assign(user, body);
    data = user;
  } else if (p === "/users/me/settings") { Object.assign(user, body); data = user; }
  else if (p.startsWith("/users/profile/")) {
    const identifier = decodeURIComponent(p.split("/").at(-1) ?? "");
    data = [user, colleague].find(person => person.username === identifier || person.publicId === identifier);
    if (!data) throw new Error("Profil topilmadi.");
  }
  else if (p === "/users/me/account-visibility") { Object.assign(user, { accountVisibility: body.visibility }); data = user; }
  else if (p === "/auth/sessions") data = [];
  else if (p.startsWith("/auth/")) data = { user, groupId: group.id };
  else if (p === "/groups") data = [group];
  else if (p.endsWith("/select")) data = { groupId: group.id };
  else if (p === `/groups/${group.id}/members`) data = [user, colleague].map(u => ({ ...u, user: u, userId: u.id, groupId: group.id, role: "owner" }));
  else if (p === "/chat/rooms") {
    if (method === "POST") { const created = { ...room, ...body, id: crypto.randomUUID(), publicId: 1000000 + rooms.length }; rooms.push(created); data = created; }
    else data = rooms;
  } else if (p === "/chat/community") data = { channel: null, group: null };
  else if (p.includes("/chat/resolve/")) {
    const kind = p.split("/").at(-2);
    const identifier = decodeURIComponent(p.split("/").at(-1) ?? "");
    let resolved = rooms.find(entry => entry.type === kind && (String(entry.publicId) === identifier || entry.slug === identifier));
    if (kind === "direct") {
      const peer = [user, colleague].find(person => person.username === identifier || person.publicId === identifier);
      if (!peer) throw new Error("Foydalanuvchi topilmadi.");
      resolved = rooms.find(entry => entry.type === "direct" && Array.isArray(entry.memberIds) && entry.memberIds.includes(peer.id));
      if (!resolved) {
        resolved = { ...room, id: `local-direct-${peer.id}`, type: "direct", name: peer.firstName, publicId: peer.publicId, scope: "private", memberIds: [user.id, peer.id], memberProfiles: [user, peer] };
        rooms.push(resolved);
      }
    }
    if (!resolved) throw new Error("Suhbat topilmadi.");
    data = { roomId: resolved.id, type: resolved.type, publicId: resolved.publicId, slug: null };
  }
  else if (p.endsWith("/messages")) {
    const roomId = p.split("/")[3];
    if (method === "POST") {
      const message = { ...body, id: crypto.randomUUID(), roomId, content: body.content ?? body.text ?? "", sequence: messages.length + 1, senderId: user.id, sender: user, createdAt: now(), reactions: [] };
      messages.push(message); data = message;
    } else data = { data: messages.filter(m => m.roomId === roomId), total: messages.filter(m => m.roomId === roomId).length };
  } else if (p.endsWith("/appearance") || p.endsWith("/voice-chat")) data = null;
  else if (p.includes("/chat/") && p.endsWith("/members")) data = { items: [{ ...user, role: "owner" }, { ...colleague, role: "member" }], total: 2 };
  else if (p.endsWith("/settings")) data = { settings: { roomId: room.id, whoCanPost: "members", reactionsEnabled: true, allowMeetings: true }, role: "owner", canAdminister: true };
  else if (p.endsWith("/settings/stats")) data = { subscribers: 2, messages: messages.length, views: 0, reach: 0, reactions: 0, storageBytes: 0, files: 0, engagement: 0, topPosts: [], growth: [] };
  else if (p.endsWith("/invite-code")) data = { code: "local-preview-invite" };
  else if (p.endsWith("/presence")) data = { [user.id]: { status: "online" }, [colleague.id]: { status: "online" } };
  else if (p === "/notifications") data = { data: [], items: [], total: 0, page: 1, limit: 20 };
  else if (p.endsWith("/unread-count")) data = { count: 0 };
  else if (p === "/meetings/media-config") data = { provider: "p2p", maxParticipants: 8 };
  else if (p.endsWith("/ice-servers")) data = [];
  else if (p === `/groups/${group.id}/meetings`) data = [meeting];
  else if (p === `/meetings/${meeting.id}` || p.includes("/meetings/by-code/") || p === "/meetings/resolve-by-code") data = meeting;
  else if (p.startsWith("/meetings/") && method !== "GET") throw new Error("Local test rejimida haqiqiy meeting ulanishi o'chirilgan.");
  else if (p === "/education/dashboard") data = { subjects: [], opened: 0, completed: 0, watchSeconds: 0, saved: 0, completionRate: 0 };
  else if (p === "/education/home") data = { subjects: [{ id: "mathematics", name: "Matematika", description: "" }], trustedChannels: [], latest: [], continueLearning: [], saved: [] };
  else if (p === "/education/videos") data = { items: [], page: 1, hasMore: false };
  else if (p === "/library/search") {
    const q = (url.searchParams.get("q") ?? "").toLocaleLowerCase();
    const items = isDemoMode() ? demoBooks.filter(book => book.title.toLocaleLowerCase().includes(q)) : [];
    data = { items, total: items.length, page: 1, hasMore: false };
  }
  else if (p.startsWith("/library/books/") && p.endsWith("/reviews")) data = { count: 0, average: null, items: [], liked: false, saved: false };
  else if (p === "/library/me/marks") data = { liked: [], saved: [] };
  else if (p === "/youtube/status") data = { enabled: true };
  else if (p.startsWith("/youtube/")) data = { items: [], hasMore: false, nextPageToken: null };
  else if (p === "/chat/ai/conversations") data = aiConversations;
  else if (p.startsWith("/chat/ai/conversations/")) {
    const id = p.split("/").at(-1);
    const conversation = aiConversations.find(item => item.id === id);
    if (!conversation) throw new Error("Suhbat topilmadi.");
    if (method === "PATCH") conversation.title = String(body.title ?? conversation.title);
    if (method === "DELETE") aiConversations.splice(aiConversations.indexOf(conversation), 1);
    data = conversation;
  }
  else if (p === "/chat/ai/memory") {
    if (method === "PATCH") aiMemory = { ...aiMemory, ...body, updatedAt: now() };
    data = aiMemory;
  }
  else if (p === "/chat/ai" || p === "/chat/ai/image" || p.includes("/mentor/chat")) {
    let conversation = aiConversations.find(item => item.id === body.conversationId);
    if (!conversation) {
      conversation = { id: crypto.randomUUID(), title: String(body.message ?? "Yangi suhbat").slice(0, 60), updatedAt: now(), messages: [] };
      aiConversations.push(conversation);
    }
    const reply = "Bu local dizayn sinovi. Haqiqiy AI serveriga so'rov yuborilmadi.";
    conversation.updatedAt = now();
    conversation.messages.push(
      { id: crypto.randomUUID(), role: "user", text: String(body.message ?? ""), hasImage: false, sources: [], createdAt: now() },
      { id: crypto.randomUUID(), role: "model", text: reply, hasImage: false, sources: [], createdAt: now() },
    );
    data = { reply, provider: "local", sources: [], grounded: false, conversationId: conversation.id, title: conversation.title };
  }
  else if (p.includes("/presign") || p.endsWith("/upload")) throw new Error("Local test rejimida bulutga yuklash o'chirilgan.");
  return structuredClone(data) as T;
}
import { isDemoMode } from "./demo";

