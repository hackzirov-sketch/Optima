'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MeetingAnswerEvent,
  MeetingIceEvent,
  MeetingOfferEvent,
  MeetingParticipantsEvent,
  MeetingToggledEvent,
  MeetingUserEvent,
} from './useWebSocket';

export type MeetingMode = 'voice' | 'video';

export interface PeerState {
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
}

export interface UseMeetingOptions {
  meetingId: string | null;
  mode: MeetingMode;
  enabled: boolean;
  currentUserId: string | null;
  // WebSocket emitters from useWebSocket
  meetingJoin: (meetingId: string) => void;
  meetingLeave: (meetingId: string) => void;
  meetingOffer: (meetingId: string, targetUserId: string, sdp: RTCSessionDescriptionInit) => void;
  meetingAnswer: (meetingId: string, targetUserId: string, sdp: RTCSessionDescriptionInit) => void;
  meetingIce: (meetingId: string, targetUserId: string, candidate: RTCIceCandidateInit) => void;
  meetingToggle: (meetingId: string, kind: 'audio' | 'video' | 'screen', enabled: boolean) => void;
  // WebSocket event handlers (set by chat page, called by useWebSocket)
  onMeetingParticipants: (evt: MeetingParticipantsEvent) => void;
  onMeetingUserJoined: (evt: MeetingUserEvent) => void;
  onMeetingUserLeft: (evt: MeetingUserEvent) => void;
  onMeetingOffer: (evt: MeetingOfferEvent) => void;
  onMeetingAnswer: (evt: MeetingAnswerEvent) => void;
  onMeetingIce: (evt: MeetingIceEvent) => void;
  onMeetingToggled: (evt: MeetingToggledEvent) => void;
}

export interface UseMeetingReturn {
  localStream: MediaStream | null;
  peerStreams: Map<string, MediaStream>;
  peerStates: Map<string, PeerState>;
  participants: string[];
  localMicOn: boolean;
  localCameraOn: boolean;
  localScreenOn: boolean;
  isJoined: boolean;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleScreen: () => Promise<void>;
  leave: () => void;
  // callbacks to pass into useWebSocket
  handlers: {
    onMeetingParticipants: (evt: MeetingParticipantsEvent) => void;
    onMeetingUserJoined: (evt: MeetingUserEvent) => void;
    onMeetingUserLeft: (evt: MeetingUserEvent) => void;
    onMeetingOffer: (evt: MeetingOfferEvent) => void;
    onMeetingAnswer: (evt: MeetingAnswerEvent) => void;
    onMeetingIce: (evt: MeetingIceEvent) => void;
    onMeetingToggled: (evt: MeetingToggledEvent) => void;
  };
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useMeeting(opts: {
  meetingId: string | null;
  mode: MeetingMode;
  enabled: boolean;
  currentUserId: string | null;
  meetingJoin: (id: string) => void;
  meetingLeave: (id: string) => void;
  meetingOffer: (id: string, target: string, sdp: RTCSessionDescriptionInit) => void;
  meetingAnswer: (id: string, target: string, sdp: RTCSessionDescriptionInit) => void;
  meetingIce: (id: string, target: string, c: RTCIceCandidateInit) => void;
  meetingToggle: (id: string, kind: 'audio' | 'video' | 'screen', enabled: boolean) => void;
}): UseMeetingReturn {
  const {
    meetingId, mode, enabled, currentUserId,
    meetingJoin, meetingLeave, meetingOffer, meetingAnswer, meetingIce, meetingToggle,
  } = opts;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<Map<string, MediaStream>>(new Map());
  const [peerStates, setPeerStates] = useState<Map<string, PeerState>>(new Map());
  const [participants, setParticipants] = useState<string[]>([]);
  const [localMicOn, setLocalMicOn] = useState(true);
  const [localCameraOn, setLocalCameraOn] = useState(mode === 'video');
  const [localScreenOn, setLocalScreenOn] = useState(false);
  const [isJoined, setIsJoined] = useState(false);

  const peerConns = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const meetingIdRef = useRef(meetingId);
  const optsRef = useRef(opts);

  useEffect(() => { meetingIdRef.current = meetingId; }, [meetingId]);
  useEffect(() => { optsRef.current = opts; }, [opts]);

  // ── Create peer connection ────────────────────────────
  const createPeer = useCallback((userId: string, polite: boolean): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    const ls = localStreamRef.current;
    if (ls) {
      ls.getTracks().forEach((track) => pc.addTrack(track, ls));
    }

    // Send ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && meetingIdRef.current) {
        optsRef.current.meetingIce(meetingIdRef.current, userId, candidate.toJSON());
      }
    };

    // Receive remote stream
    pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (stream) {
        setPeerStreams((prev) => {
          const next = new Map(prev);
          next.set(userId, stream);
          return next;
        });
      }
    };

    // Polite peer: re-offer on negotiation needed
    pc.onnegotiationneeded = async () => {
      if (!polite || !meetingIdRef.current) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        optsRef.current.meetingOffer(meetingIdRef.current, userId, offer);
      } catch (err) {
        console.error('[Meeting] onnegotiationneeded error', err);
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        setPeerStreams((prev) => { const n = new Map(prev); n.delete(userId); return n; });
        setPeerStates((prev) => { const n = new Map(prev); n.delete(userId); return n; });
      }
    };

    peerConns.current.set(userId, pc);
    return pc;
  }, []);

  // ── Join meeting ──────────────────────────────────────
  useEffect(() => {
    if (!enabled || !meetingId) return;

    let cancelled = false;

    const join = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: true,
          video: mode === 'video' ? { width: 1280, height: 720, facingMode: 'user' } : false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setLocalMicOn(true);
        setLocalCameraOn(mode === 'video');
        meetingJoin(meetingId);
        setIsJoined(true);
      } catch (err) {
        console.error('[Meeting] getUserMedia failed', err);
      }
    };

    join();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, meetingId]);

  // ── Leave + cleanup ───────────────────────────────────
  const leave = useCallback(() => {
    const mid = meetingIdRef.current;
    if (mid) meetingLeave(mid);

    peerConns.current.forEach((pc) => pc.close());
    peerConns.current.clear();

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;

    setLocalStream(null);
    setPeerStreams(new Map());
    setPeerStates(new Map());
    setParticipants([]);
    setIsJoined(false);
  }, [meetingLeave]);

  // Cleanup on unmount or disabled
  useEffect(() => {
    if (!enabled) {
      leave();
    }
  }, [enabled, leave]);

  useEffect(() => {
    return () => { leave(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Meeting event handlers ────────────────────────────

  const handleParticipants = useCallback(({ userIds }: MeetingParticipantsEvent) => {
    setParticipants(userIds);
    // Create offers to all existing participants (we are the newcomer)
    userIds.forEach(async (uid) => {
      const pc = createPeer(uid, true);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (meetingIdRef.current) {
          optsRef.current.meetingOffer(meetingIdRef.current, uid, offer);
        }
      } catch (err) {
        console.error('[Meeting] create offer error', err);
      }
    });
  }, [createPeer]);

  const handleUserJoined = useCallback(({ userId }: MeetingUserEvent) => {
    setParticipants((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    // The joining user will send us an offer; we just prepare state
    if (!peerConns.current.has(userId)) {
      createPeer(userId, false);
    }
  }, [createPeer]);

  const handleUserLeft = useCallback(({ userId }: MeetingUserEvent) => {
    peerConns.current.get(userId)?.close();
    peerConns.current.delete(userId);
    setParticipants((prev) => prev.filter((id) => id !== userId));
    setPeerStreams((prev) => { const n = new Map(prev); n.delete(userId); return n; });
    setPeerStates((prev) => { const n = new Map(prev); n.delete(userId); return n; });
  }, []);

  const handleOffer = useCallback(async ({ fromUserId, sdp }: MeetingOfferEvent) => {
    let pc = peerConns.current.get(fromUserId);
    if (!pc) pc = createPeer(fromUserId, false);

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (meetingIdRef.current) {
      optsRef.current.meetingAnswer(meetingIdRef.current, fromUserId, answer);
    }
  }, [createPeer]);

  const handleAnswer = useCallback(async ({ fromUserId, sdp }: MeetingAnswerEvent) => {
    const pc = peerConns.current.get(fromUserId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }, []);

  const handleIce = useCallback(async ({ fromUserId, candidate }: MeetingIceEvent) => {
    const pc = peerConns.current.get(fromUserId);
    if (!pc || !candidate) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[Meeting] addIceCandidate error', err);
    }
  }, []);

  const handleToggled = useCallback(({ userId, kind, enabled: on }: MeetingToggledEvent) => {
    setPeerStates((prev) => {
      const n = new Map(prev);
      const cur = n.get(userId) ?? { micOn: true, cameraOn: true, screenOn: false };
      n.set(userId, {
        ...cur,
        micOn: kind === 'audio' ? on : cur.micOn,
        cameraOn: kind === 'video' ? on : cur.cameraOn,
        screenOn: kind === 'screen' ? on : cur.screenOn,
      });
      return n;
    });
  }, []);

  // ── Local controls ────────────────────────────────────
  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream || !meetingIdRef.current) return;
    const newVal = !localMicOn;
    stream.getAudioTracks().forEach((t) => { t.enabled = newVal; });
    setLocalMicOn(newVal);
    optsRef.current.meetingToggle(meetingIdRef.current, 'audio', newVal);
  }, [localMicOn]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream || !meetingIdRef.current) return;
    const newVal = !localCameraOn;
    stream.getVideoTracks().forEach((t) => { t.enabled = newVal; });
    setLocalCameraOn(newVal);
    optsRef.current.meetingToggle(meetingIdRef.current, 'video', newVal);
  }, [localCameraOn]);

  const toggleScreen = useCallback(async () => {
    if (!meetingIdRef.current) return;

    if (localScreenOn) {
      // Stop screen share, restore camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setLocalScreenOn(false);
      optsRef.current.meetingToggle(meetingIdRef.current, 'screen', false);

      // Replace video track in all peers back to camera
      const ls = localStreamRef.current;
      if (ls) {
        const camTrack = ls.getVideoTracks()[0];
        if (camTrack) {
          peerConns.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
            sender?.replaceTrack(camTrack);
          });
        }
      }
    } else {
      try {
        const screen = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];

        // Replace video track in all peer connections
        peerConns.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          sender?.replaceTrack(screenTrack);
        });

        screenTrack.onended = () => {
          setLocalScreenOn(false);
          if (meetingIdRef.current) {
            optsRef.current.meetingToggle(meetingIdRef.current, 'screen', false);
          }
        };

        setLocalScreenOn(true);
        optsRef.current.meetingToggle(meetingIdRef.current, 'screen', true);
      } catch (err) {
        console.error('[Meeting] getDisplayMedia error', err);
      }
    }
  }, [localScreenOn]);

  return {
    localStream,
    peerStreams,
    peerStates,
    participants,
    localMicOn,
    localCameraOn,
    localScreenOn,
    isJoined,
    toggleMic,
    toggleCamera,
    toggleScreen,
    leave,
    handlers: {
      onMeetingParticipants: handleParticipants,
      onMeetingUserJoined: handleUserJoined,
      onMeetingUserLeft: handleUserLeft,
      onMeetingOffer: handleOffer,
      onMeetingAnswer: handleAnswer,
      onMeetingIce: handleIce,
      onMeetingToggled: handleToggled,
    },
  };
}
