import { useCallback, useEffect, useRef, useState } from "react";

export type MeetingChatMessage = { id: string; senderId: string; text: string; time: number };
export function parseMeetingChat(raw: unknown, senderId: string): MeetingChatMessage | null {
  if (typeof raw !== "string" || raw.length > 10000) return null;
  try {
    const value = JSON.parse(raw);
    if (value.type !== "optima-chat-v1" || typeof value.id !== "string" || value.id.length > 80 || !value.id || typeof value.text !== "string" || !value.text.trim() || value.text.length > 2000) return null;
    return { id: value.id, text: value.text, senderId, time: Date.now() };
  } catch { return null; }
}

export function useMeetingChat(meetingId: string | null, selfId: string) {
  const channels = useRef(new Map<string, RTCDataChannel>());
  const ready = useRef(new WeakSet<RTCDataChannel>());
  const [messages, setMessages] = useState<MeetingChatMessage[]>([]);
  const [connected, setConnected] = useState(0);
  // Set when meeting media runs through LiveKit: chat then rides the SFU's
  // data channel instead of one RTCDataChannel per peer.
  const external = useRef<((payload: string) => number) | null>(null);
  const recount = useCallback(() => setConnected([...channels.current.values()].filter(c => c.readyState === "open" && ready.current.has(c)).length), []);
  const attach = useCallback((peer: RTCPeerConnection, id: string) => {
    // Both updated clients reserve stream 42 before their existing SDP exchange.
    const channel = peer.createDataChannel("optima-meeting-chat", { negotiated: true, id: 42, ordered: true });
    channels.current.get(id)?.close();
    channels.current.set(id, channel);
    channel.onopen = () => { channel.send("optima-chat-ready-v1"); recount(); };
    channel.onclose = recount;
    channel.onerror = recount;
    channel.onmessage = event => {
      if (event.data === "optima-chat-ready-v1") { ready.current.add(channel); recount(); return; }
      const message = parseMeetingChat(event.data, id);
      if (!message) return;
      setMessages(current => current.some(item => item.id === message.id && item.senderId === id) ? current : [...current.slice(-499), message]);
    };
  }, [recount]);
  useEffect(() => {
    setMessages([]);
    setConnected(0);
    return () => {
      channels.current.forEach(channel => { channel.onmessage = null; channel.onclose = null; channel.onopen = null; channel.onerror = null; channel.close(); });
      channels.current.clear();
    };
  }, [meetingId]);
  /** Switches chat to an external transport (or back to data channels with null). */
  const setTransport = useCallback((send: ((payload: string) => number) | null, peers = 0) => {
    external.current = send;
    setConnected(send ? peers : 0);
  }, []);
  /** A message that arrived over the external transport. */
  const receive = useCallback((senderId: string, raw: string) => {
    const message = parseMeetingChat(raw, senderId);
    if (!message) return;
    setMessages(current => current.some(item => item.id === message.id && item.senderId === senderId) ? current : [...current.slice(-499), message]);
  }, []);
  const send = useCallback((text: string) => {
    const body = text.trim();
    if (!body || body.length > 2000) return 0;
    const message = { id: crypto.randomUUID(), senderId: selfId, text: body, time: Date.now() };
    const payload = JSON.stringify({ type: "optima-chat-v1", id: message.id, text: body });
    // Writing into an empty room is fine: the message shows for the sender
    // and reaches whoever is connected (possibly nobody yet). Only a send the
    // transport refused outright counts as a failure.
    if (external.current) {
      external.current(payload);
      setMessages(current => [...current.slice(-499), message]);
      return 1;
    }
    let sent = 0;
    channels.current.forEach(channel => {
      if (channel.readyState !== "open" || !ready.current.has(channel) || channel.bufferedAmount > 64000) return;
      try { channel.send(payload); sent++; } catch { /* Keep other connected recipients reachable. */ }
    });
    setMessages(current => [...current.slice(-499), message]);
    return Math.max(sent, 1);
  }, [selfId]);
  return { messages, connected, attach, send, setTransport, receive };
}
