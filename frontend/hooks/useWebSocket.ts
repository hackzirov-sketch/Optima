'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getAccessToken } from '@/lib/api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

// ─── Types ────────────────────────────────────────────

export interface WsMessage {
  id: string;
  roomId: string;
  userId: string;
  text: string;
  replyToId?: string | null;
  timestamp: number;
  reactions: { emoji: string; userIds: string[] }[];
}

export interface TypingEvent {
  userId: string;
  roomId: string;
  typing: boolean;
}

export interface WsNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  createdAt: string;
}

export interface ReactionEvent {
  messageId: string;
  roomId: string;
  emoji: string;
  userId: string;
}

export interface MeetingParticipantsEvent {
  meetingId: string;
  userIds: string[];
}

export interface MeetingUserEvent {
  meetingId: string;
  userId: string;
}

export interface MeetingOfferEvent {
  meetingId: string;
  fromUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface MeetingAnswerEvent {
  meetingId: string;
  fromUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface MeetingIceEvent {
  meetingId: string;
  fromUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface MeetingToggledEvent {
  meetingId: string;
  userId: string;
  kind: 'audio' | 'video' | 'screen';
  enabled: boolean;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// ─── Dynamic Socket.IO import ─────────────────────────

let socketIoPromise: Promise<typeof import('socket.io-client')> | null = null;
function getSocketIo() {
  if (!socketIoPromise) {
    socketIoPromise = import('socket.io-client');
  }
  return socketIoPromise;
}

// ─── Singleton socket ─────────────────────────────────

let globalSocket: import('socket.io-client').Socket | null = null;
let connectListeners: (() => void)[] = [];
let disconnectListeners: (() => void)[] = [];

// ─── Hook ─────────────────────────────────────────────

export interface UseWebSocketOptions {
  /** rooms to auto-join on connect */
  rooms?: string[];
  onNewMessage?: (msg: WsMessage) => void;
  onTyping?: (evt: TypingEvent) => void;
  onNotification?: (notif: WsNotification) => void;
  onReactionUpdated?: (evt: ReactionEvent) => void;
  onUserOnline?: (userId: string) => void;
  onUserOffline?: (userId: string) => void;
  // ── Meeting (WebRTC signaling) ──
  onMeetingParticipants?: (evt: MeetingParticipantsEvent) => void;
  onMeetingUserJoined?: (evt: MeetingUserEvent) => void;
  onMeetingUserLeft?: (evt: MeetingUserEvent) => void;
  onMeetingOffer?: (evt: MeetingOfferEvent) => void;
  onMeetingAnswer?: (evt: MeetingAnswerEvent) => void;
  onMeetingIce?: (evt: MeetingIceEvent) => void;
  onMeetingToggled?: (evt: MeetingToggledEvent) => void;
  /** disable connection (e.g. no auth) */
  disabled?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    rooms = [],
    onNewMessage,
    onTyping,
    onNotification,
    onReactionUpdated,
    onUserOnline,
    onUserOffline,
    onMeetingParticipants,
    onMeetingUserJoined,
    onMeetingUserLeft,
    onMeetingOffer,
    onMeetingAnswer,
    onMeetingIce,
    onMeetingToggled,
    disabled = false,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const socketRef = useRef<import('socket.io-client').Socket | null>(null);
  const roomsRef = useRef<string[]>(rooms);
  const mountedRef = useRef(true);

  // Keep rooms ref updated
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  // ── Connect ───────────────────────────────────────────
  useEffect(() => {
    if (disabled) return;
    mountedRef.current = true;

    const connect = async () => {
      const token = getAccessToken();
      if (!token) {
        setStatus('error');
        return;
      }

      const { io } = await getSocketIo();

      // Reuse global socket if already connected
      if (globalSocket?.connected) {
        socketRef.current = globalSocket;
        if (mountedRef.current) setStatus('connected');
        // Join rooms
        roomsRef.current.forEach((r) => globalSocket!.emit('join_room', { roomId: r }));
        attachListeners(globalSocket);
        return;
      }

      if (mountedRef.current) setStatus('connecting');

      const socket = io(WS_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1500,
      });

      globalSocket = socket;
      socketRef.current = socket;

      socket.on('connect', () => {
        if (!mountedRef.current) return;
        setStatus('connected');
        // Join all rooms
        roomsRef.current.forEach((r) => socket.emit('join_room', { roomId: r }));
        connectListeners.forEach((fn) => fn());
      });

      socket.on('disconnect', () => {
        if (!mountedRef.current) return;
        setStatus('disconnected');
        disconnectListeners.forEach((fn) => fn());
      });

      socket.on('connect_error', () => {
        if (!mountedRef.current) return;
        setStatus('error');
      });

      attachListeners(socket);
    };

    connect();

    return () => {
      mountedRef.current = false;
      // Detach listeners but keep socket alive (singleton)
      detachListeners();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  // ── Join new rooms when rooms prop changes ────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    rooms.forEach((r) => socket.emit('join_room', { roomId: r }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rooms)]);

  // ── Listener setup ────────────────────────────────────
  const cbRefs = useRef({
    onNewMessage, onTyping, onNotification, onReactionUpdated, onUserOnline, onUserOffline,
    onMeetingParticipants, onMeetingUserJoined, onMeetingUserLeft,
    onMeetingOffer, onMeetingAnswer, onMeetingIce, onMeetingToggled,
  });
  useEffect(() => {
    cbRefs.current = {
      onNewMessage, onTyping, onNotification, onReactionUpdated, onUserOnline, onUserOffline,
      onMeetingParticipants, onMeetingUserJoined, onMeetingUserLeft,
      onMeetingOffer, onMeetingAnswer, onMeetingIce, onMeetingToggled,
    };
  });

  function attachListeners(socket: import('socket.io-client').Socket) {
    socket.on('new_message', (raw: Record<string, unknown>) => {
      const senderId = (raw.senderId ?? raw.userId) as string | undefined;
      const content = (raw.content ?? raw.text) as string | undefined;
      const createdAt = raw.createdAt as string | number | undefined;
      const timestamp =
        typeof raw.timestamp === 'number'
          ? raw.timestamp
          : createdAt
            ? new Date(createdAt).getTime()
            : Date.now();

      const msg: WsMessage = {
        id: String(raw.id),
        roomId: String(raw.roomId),
        userId: senderId ?? 'unknown',
        text: content ?? '',
        replyToId: (raw.replyToId as string | null | undefined) ?? undefined,
        timestamp,
        reactions: Array.isArray(raw.reactions) ? (raw.reactions as WsMessage['reactions']) : [],
      };
      cbRefs.current.onNewMessage?.(msg);
    });
    socket.on('typing', (evt: TypingEvent) => cbRefs.current.onTyping?.(evt));
    socket.on('notification', (n: WsNotification) => cbRefs.current.onNotification?.(n));
    socket.on('reaction_updated', (evt: ReactionEvent) => cbRefs.current.onReactionUpdated?.(evt));
    socket.on('user_online', ({ userId }: { userId: string }) => {
      setOnlineUsers((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      cbRefs.current.onUserOnline?.(userId);
    });
    socket.on('user_offline', ({ userId }: { userId: string }) => {
      setOnlineUsers((prev) => prev.filter((id) => id !== userId));
      cbRefs.current.onUserOffline?.(userId);
    });
    socket.on('online_users', ({ userIds }: { userIds: string[] }) => {
      setOnlineUsers(userIds);
    });

    // Meeting (WebRTC signaling)
    socket.on('meeting:participants', (evt: MeetingParticipantsEvent) => cbRefs.current.onMeetingParticipants?.(evt));
    socket.on('meeting:user-joined', (evt: MeetingUserEvent) => cbRefs.current.onMeetingUserJoined?.(evt));
    socket.on('meeting:user-left', (evt: MeetingUserEvent) => cbRefs.current.onMeetingUserLeft?.(evt));
    socket.on('meeting:offer', (evt: MeetingOfferEvent) => cbRefs.current.onMeetingOffer?.(evt));
    socket.on('meeting:answer', (evt: MeetingAnswerEvent) => cbRefs.current.onMeetingAnswer?.(evt));
    socket.on('meeting:ice-candidate', (evt: MeetingIceEvent) => cbRefs.current.onMeetingIce?.(evt));
    socket.on('meeting:toggled', (evt: MeetingToggledEvent) => cbRefs.current.onMeetingToggled?.(evt));
  }

  function detachListeners() {
    const socket = socketRef.current;
    if (!socket) return;
    socket.off('new_message');
    socket.off('typing');
    socket.off('notification');
    socket.off('reaction_updated');
    socket.off('user_online');
    socket.off('user_offline');
    socket.off('online_users');
    socket.off('meeting:participants');
    socket.off('meeting:user-joined');
    socket.off('meeting:user-left');
    socket.off('meeting:offer');
    socket.off('meeting:answer');
    socket.off('meeting:ice-candidate');
    socket.off('meeting:toggled');
  }

  // ── Public actions ────────────────────────────────────
  const sendMessage = useCallback((roomId: string, text: string, replyToId?: string) => {
    socketRef.current?.emit('send_message', { roomId, text, replyToId });
  }, []);

  const sendTyping = useCallback((roomId: string, typing: boolean) => {
    socketRef.current?.emit('typing', { roomId, typing });
  }, []);

  const joinRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('join_room', { roomId });
  }, []);

  const leaveRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('leave_room', { roomId });
  }, []);

  const addReaction = useCallback((roomId: string, messageId: string, emoji: string) => {
    socketRef.current?.emit('add_reaction', { roomId, messageId, emoji });
  }, []);

  const markRead = useCallback((roomId: string, messageId: string) => {
    socketRef.current?.emit('message_read', { roomId, messageId });
  }, []);

  // ── Meeting emit helpers ──────────────────────────────
  const meetingJoin = useCallback((meetingId: string) => {
    socketRef.current?.emit('meeting:join', { meetingId });
  }, []);

  const meetingLeave = useCallback((meetingId: string) => {
    socketRef.current?.emit('meeting:leave', { meetingId });
  }, []);

  const meetingOffer = useCallback((meetingId: string, targetUserId: string, sdp: RTCSessionDescriptionInit) => {
    socketRef.current?.emit('meeting:offer', { meetingId, targetUserId, sdp });
  }, []);

  const meetingAnswer = useCallback((meetingId: string, targetUserId: string, sdp: RTCSessionDescriptionInit) => {
    socketRef.current?.emit('meeting:answer', { meetingId, targetUserId, sdp });
  }, []);

  const meetingIce = useCallback((meetingId: string, targetUserId: string, candidate: RTCIceCandidateInit) => {
    socketRef.current?.emit('meeting:ice-candidate', { meetingId, targetUserId, candidate });
  }, []);

  const meetingToggle = useCallback((meetingId: string, kind: 'audio' | 'video' | 'screen', enabled: boolean) => {
    socketRef.current?.emit('meeting:toggle', { meetingId, kind, enabled });
  }, []);

  return {
    status,
    isConnected: status === 'connected',
    onlineUsers,
    sendMessage,
    sendTyping,
    joinRoom,
    leaveRoom,
    addReaction,
    markRead,
    meetingJoin,
    meetingLeave,
    meetingOffer,
    meetingAnswer,
    meetingIce,
    meetingToggle,
  };
}

// ─── Standalone helpers ───────────────────────────────

export function disconnectWebSocket() {
  if (globalSocket) {
    globalSocket.disconnect();
    globalSocket = null;
  }
}

export function onWsConnect(fn: () => void) {
  connectListeners.push(fn);
  return () => { connectListeners = connectListeners.filter((f) => f !== fn); };
}

export function onWsDisconnect(fn: () => void) {
  disconnectListeners.push(fn);
  return () => { disconnectListeners = disconnectListeners.filter((f) => f !== fn); };
}
