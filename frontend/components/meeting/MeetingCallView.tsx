'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Hand,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  Send,
  Users,
  Video,
  VideoOff,
  MessageSquare,
  Sparkles,
  MoreVertical,
  X,
  Phone,
  MonitorUp,
  Copy,
  Check,
  UserPlus
} from 'lucide-react';
import { cn } from '@/components/chat/chatShared';
import { useWebSocket } from '@/hooks/useWebSocket';
import { meetingsApi, getAccessToken, API_BASE } from '@/lib/api';

interface Participant {
  id: string;
  name: string;
  initials: string;
  color: string;
  isHost?: boolean;
  isSelf?: boolean;
  isMuted?: boolean;
  cameraOff?: boolean;
}

interface MeetingCallViewProps {
  meetingId: string;
  meetingCode?: string;
  title: string;
  participants: Participant[];
  workspaceMembers?: any[];
  /** Current logged-in user's id — used to keep them out of their own invite list. */
  currentUserId?: string;
  onLeave: () => void;
}

function useTimer(startedAt: number) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
  const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function DockButton({
  icon: Icon,
  label,
  active,
  onClick,
  danger,
  color = 'dark',
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
  danger?: boolean;
  color?: 'dark' | 'blue' | 'red';
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 min-w-[64px] group">
      <div
        className={cn(
          'h-12 w-12 rounded-full flex items-center justify-center transition-all',
          color === 'blue'
            ? 'bg-[#4361EE] text-white shadow-[0_0_20px_rgba(67,97,238,0.3)]'
            : color === 'red'
            ? 'bg-[#EF233C] text-white shadow-[0_0_20px_rgba(239,35,60,0.3)] hover:bg-red-600'
            : active
            ? 'bg-white/10 text-white hover:bg-white/20'
            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white',
        )}
      >
        <Icon className="h-[22px] w-[22px]" />
      </div>
      <span className="text-[10px] font-semibold text-gray-400 group-hover:text-gray-300">{label}</span>
    </button>
  );
}

function TabButton({ icon: Icon, label, active, onClick }: { icon: React.ElementType, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all",
        active 
          ? "bg-[#4361EE]/10 border border-[#4361EE]/30 text-[#4361EE]" 
          : "bg-transparent hover:bg-white/5 text-gray-400 border border-transparent"
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}

function ParticipantVideo({ p, stream, isScreenSharing, className }: { p: Participant, stream?: MediaStream | null, isScreenSharing?: boolean, className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={cn("relative overflow-hidden bg-[#161824]", className)}>
      {stream && !p.cameraOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={p.isSelf}
          className={cn(
            "absolute inset-0 h-full w-full",
            isScreenSharing ? "object-contain bg-[#0F111A]" : "object-cover",
            (p.isSelf && !isScreenSharing) && "scale-x-[-1]"
          )}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1A1D2B] to-[#12141E]">
          <div
            className="grid h-24 w-24 place-items-center rounded-full text-3xl font-black text-white shadow-xl"
            style={{ background: p.color }}
          >
            {p.initials}
          </div>
        </div>
      )}
      
      {/* Bottom overlay name */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between z-10">
        <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-2 border border-white/5">
          {p.isMuted ? <MicOff className="h-3.5 w-3.5 text-red-400" /> : <Mic className="h-3.5 w-3.5 text-green-400" />}
          <span className="text-xs font-medium text-white">{p.name}</span>
        </div>
        {(p.cameraOff || p.isMuted) && (
          <div className="bg-red-500/80 backdrop-blur-md h-7 w-7 rounded-full flex items-center justify-center">
             {p.isMuted ? <MicOff className="h-3.5 w-3.5 text-white" /> : <VideoOff className="h-3.5 w-3.5 text-white" />}
          </div>
        )}
      </div>
    </div>
  );
}

export function MeetingCallView({ meetingId, meetingCode, title, participants, workspaceMembers, currentUserId, onLeave }: MeetingCallViewProps) {
  const startedAt = useRef(Date.now()).current;
  const timer = useTimer(startedAt);
  const [copied, setCopied] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2000);
  };

  const handleInvite = async (userId: string) => {
    try {
      await meetingsApi.inviteMembers(meetingId, [userId]);
      showToast("Taklif yuborildi!");
      setShowInvite(false);
    } catch {
      showToast("Xatolik yuz berdi");
    }
  };

  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'participants' | 'ai'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatMsg, setChatMsg] = useState('');
  const [chatMessages, setChatMessages] = useState<{ name: string; text: string; isSelf: boolean; time: string }[]>([
    { name: 'Nigora Saidova', text: "Yangi dizayn prototipini ko'rib chiqdingizmi?", isSelf: false, time: '10:42' },
    { name: 'Siz', text: "Ha, ko'rdim. Ranglar palitrasi ajoyib chiqqan!", isSelf: true, time: '10:45' },
    { name: 'Jasur Akramov', text: "Kodni Github-ga yukladim, tekshirib ko'ringlar.", isSelf: false, time: '10:46' },
  ]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [activeUserIds, setActiveUserIds] = useState<string[]>([]);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // AI Meeting Assistant — real Gemini-backed chat, scoped to this call.
  const [aiMessages, setAiMessages] = useState<{ id: string; role: 'user' | 'model'; text: string }[]>([]);
  const [aiDraft, setAiDraft] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const sendAiMessage = async () => {
    const text = aiDraft.trim();
    if (!text || aiLoading) return;
    setAiDraft('');
    const userMsg = { id: `ai-u-${Date.now()}`, role: 'user' as const, text };
    const thinkingId = `ai-thinking-${Date.now()}`;
    setAiMessages((prev) => [...prev, userMsg, { id: thinkingId, role: 'model' as const, text: '…' }]);
    setAiLoading(true);

    const history = aiMessages.slice(-20).map((m) => ({ role: m.role, text: m.text }));

    try {
      const res = await fetch(`${API_BASE}/chat/ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken() ?? ''}`,
        },
        // Prefix with the meeting title so the assistant has context on
        // what's being discussed (no separate backend endpoint needed —
        // /chat/ai already accepts free-form message + history).
        body: JSON.stringify({
          message: `[Uchrashuv: "${title}"] ${text}`,
          history,
        }),
      });
      const json = await res.json().catch(() => null);
      const reply: string = json?.data?.reply ?? json?.reply ?? "Hozircha javob bera olmayapman.";
      setAiMessages((prev) => prev.map((m) => (m.id === thinkingId ? { ...m, text: reply } : m)));
    } catch {
      setAiMessages((prev) =>
        prev.map((m) => (m.id === thinkingId ? { ...m, text: "Tarmoq xatosi. Qayta urinib ko'ring." } : m)),
      );
    } finally {
      setAiLoading(false);
    }
  };

  // Invite list must never include the current user (host or otherwise) —
  // inviting yourself is meaningless and previously showed up as a bug
  // where the host could "invite" themself. Also skip people already in
  // the call so the list only shows who's actually inviteable.
  const invitableMembers = useMemo(
    () =>
      (workspaceMembers ?? []).filter(
        (member) => member.userId !== currentUserId && !activeUserIds.includes(member.userId),
      ),
    [workspaceMembers, currentUserId, activeUserIds],
  );
  const [showAiSummary, setShowAiSummary] = useState(true);
  
  const self = participants.find((p) => p.isSelf) ?? participants[0];
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});

  const activeParticipants = participants.filter(p => p.isSelf || activeUserIds.includes(p.id));

  const mainParticipant = activeParticipants[0] || self;
  const thumbnailParticipants = activeParticipants.slice(1, 4);
  const remainingCount = Math.max(0, activeParticipants.length - 4);

  // ── WebRTC Signaling ──
  const { meetingJoin, meetingLeave, meetingOffer, meetingAnswer, meetingIce } = useWebSocket({
    onMeetingParticipants: async (evt) => {
      if (evt.meetingId !== meetingId) return;
      setActiveUserIds(evt.userIds);
      for (const uid of evt.userIds) {
        if (uid === self.id) continue;
        createPeerAndOffer(uid);
      }
    },
    onMeetingUserJoined: (evt) => {
      if (evt.meetingId !== meetingId) return;
      setActiveUserIds((prev) => (prev.includes(evt.userId) ? prev : [...prev, evt.userId]));
    },
    onMeetingOffer: async (evt) => {
      if (evt.meetingId !== meetingId) return;
      await handleOffer(evt.fromUserId, evt.sdp);
    },
    onMeetingAnswer: async (evt) => {
      if (evt.meetingId !== meetingId) return;
      await handleAnswer(evt.fromUserId, evt.sdp);
    },
    onMeetingIce: async (evt) => {
      if (evt.meetingId !== meetingId) return;
      await handleIce(evt.fromUserId, evt.candidate);
    },
    onMeetingUserLeft: (evt) => {
      if (evt.meetingId !== meetingId) return;
      setActiveUserIds((prev) => prev.filter((id) => id !== evt.userId));
      removePeer(evt.userId);
    }
  });

  const getOrCreatePeer = (targetUserId: string) => {
    if (peersRef.current[targetUserId]) return peersRef.current[targetUserId];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peersRef.current[targetUserId] = pc;
    pc.onicecandidate = (e) => { if (e.candidate) meetingIce(meetingId, targetUserId, e.candidate); };
    pc.ontrack = (e) => { setRemoteStreams((prev) => ({ ...prev, [targetUserId]: e.streams[0] })); };
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }
    return pc;
  };

  const createPeerAndOffer = async (targetUserId: string) => {
    const pc = getOrCreatePeer(targetUserId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    meetingOffer(meetingId, targetUserId, pc.localDescription!);
  };

  const handleOffer = async (fromUserId: string, sdp: RTCSessionDescriptionInit) => {
    const pc = getOrCreatePeer(fromUserId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    meetingAnswer(meetingId, fromUserId, pc.localDescription!);
  };

  const handleAnswer = async (fromUserId: string, sdp: RTCSessionDescriptionInit) => {
    const pc = peersRef.current[fromUserId];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  };

  const handleIce = async (fromUserId: string, candidate: RTCIceCandidateInit) => {
    const pc = peersRef.current[fromUserId];
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
  };

  const removePeer = (userId: string) => {
    if (peersRef.current[userId]) {
      peersRef.current[userId].close();
      delete peersRef.current[userId];
    }
    setRemoteStreams((prev) => {
      const copy = { ...prev };
      delete copy[userId];
      return copy;
    });
  };

  // Request Local Camera Stream on Mount
  useEffect(() => {
    let stream: MediaStream | null = null;
    const startVideo = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setDeviceError(null);
        setLocalStream(stream);
        Object.values(peersRef.current).forEach((pc) => {
          stream!.getTracks().forEach((track) => {
            const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
            if (!sender) pc.addTrack(track, stream!);
          });
        });
      } catch (err) {
        setDeviceError("Kamera yoki mikrofonga ruxsat berilmagan.");
      }
      meetingJoin(meetingId);
    };
    startVideo();

    return () => {
      meetingLeave(meetingId);
      if (stream) stream.getTracks().forEach(track => track.stop());
      Object.values(peersRef.current).forEach(pc => pc.close());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // Update stream tracks when toggling mic/camera
  useEffect(() => {
    if (localStream && !screenOn) {
      localStream.getAudioTracks().forEach(track => track.enabled = micOn);
      localStream.getVideoTracks().forEach(track => track.enabled = cameraOn);
    }
  }, [micOn, cameraOn, localStream, screenOn]);

  const revertToCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getAudioTracks().forEach(t => t.enabled = micOn);
      stream.getVideoTracks().forEach(t => t.enabled = cameraOn);
      setLocalStream(stream);
      setScreenOn(false);
      const newVideoTrack = stream.getVideoTracks()[0];
      Object.values(peersRef.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender && newVideoTrack) sender.replaceTrack(newVideoTrack);
      });
    } catch (err) {
      console.error("Failed to revert to camera", err);
    }
  };

  const handleScreenShare = async () => {
    if (screenOn) {
      await revertToCamera();
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = stream.getVideoTracks()[0];
        screenTrack.onended = () => revertToCamera();
        const newStream = new MediaStream([screenTrack, ...(localStream ? localStream.getAudioTracks() : [])]);
        setLocalStream(newStream);
        setScreenOn(true);
        Object.values(peersRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender && screenTrack) sender.replaceTrack(screenTrack);
        });
      } catch (err) {
        setDeviceError("Ekranni ulashish bekor qilindi yoki ruxsat yo'q.");
        setTimeout(() => setDeviceError(null), 5000);
      }
    }
  };

  const handleSendChat = () => {
    const text = chatMsg.trim();
    if (!text) return;
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setChatMessages((prev) => [...prev, { name: self?.name ?? 'Siz', text, isSelf: true, time }]);
    setChatMsg('');
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(meetingCode || '');
    showToast("Kod nusxalandi");
    setShowMoreMenu(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0F111A] text-white overflow-hidden font-sans">
      <div className="flex-1 flex overflow-hidden">
      {/* Local Toast */}
      {toastMsg && (
        <div className="absolute top-8 right-8 z-[300] rounded-xl bg-[#4361EE] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_0_20px_rgba(67,97,238,0.3)] transition-all animate-in fade-in slide-in-from-top-4">
          {toastMsg}
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="absolute inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#161824] border border-white/10 rounded-[24px] w-full max-w-[400px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
               <h3 className="text-[17px] font-bold text-white">Taklif qilish</h3>
               <button onClick={() => setShowInvite(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
               </button>
            </div>
            <div className="p-2 max-h-[350px] overflow-y-auto">
               {invitableMembers.map(member => (
                 <button
                   key={member.userId}
                   onClick={() => handleInvite(member.userId)}
                   className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition-colors text-left group"
                 >
                    <div className="w-10 h-10 rounded-full bg-[#4361EE]/20 text-[#4361EE] flex items-center justify-center font-bold text-[13px] flex-shrink-0">
                       {member.user.firstName?.[0] || 'U'}
                    </div>
                    <div className="min-w-0 flex-1">
                       <div className="text-[14px] font-bold text-gray-200 truncate">{member.user.firstName} {member.user.lastName}</div>
                       <div className="text-[12px] font-medium text-gray-500 truncate">{member.user.email}</div>
                    </div>
                    <div className="text-[#4361EE] opacity-0 group-hover:opacity-100 transition-opacity">
                      <UserPlus className="w-4 h-4" />
                    </div>
                 </button>
               ))}
               {invitableMembers.length === 0 && (
                 <div className="p-6 text-center text-gray-500 text-[13px] font-medium">Boshqa a'zolar topilmadi.</div>
               )}
            </div>
          </div>
        </div>
      )}

      {deviceError && (
        <div className="absolute top-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#EF233C]/90 px-4 py-2.5 text-sm font-medium text-white shadow-2xl backdrop-blur-md">
          <span>⚠️</span>
          <span>{deviceError}</span>
          <button onClick={() => setDeviceError(null)} className="ml-2 grid h-6 w-6 place-items-center rounded-lg bg-white/20 hover:bg-white/30">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Left Area (Main) ── */}
      <div className="flex-1 min-w-0 flex flex-col relative">
        {/* Main Video View */}
        <div className="relative flex-1 bg-[#161824] overflow-hidden">
          <ParticipantVideo 
            p={{ ...mainParticipant, cameraOff: mainParticipant.isSelf ? (!cameraOn && !screenOn) : mainParticipant.cameraOff, isMuted: mainParticipant.isSelf ? !micOn : mainParticipant.isMuted }} 
            stream={mainParticipant.isSelf ? localStream : remoteStreams[mainParticipant.id]}
            isScreenSharing={mainParticipant.isSelf ? screenOn : false}
            className="w-full h-full"
          />

          {/* Top Left Badges */}
          <div className="absolute top-4 left-4 flex items-center gap-2 z-20">
            <div className="bg-black/50 backdrop-blur-xl px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-semibold text-gray-200 border border-white/10 shadow-lg">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Yozib olinyapti • {timer}
            </div>
            <div className="bg-black/50 backdrop-blur-xl px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-semibold text-gray-200 border border-white/10 shadow-lg">
              <Users className="w-3.5 h-3.5" />
              {activeParticipants.length} kishi
            </div>
          </div>

          {/* Top Right Badges */}
          <div className="absolute top-4 right-4 z-20">
            <div className="bg-[#4361EE]/20 text-[#4361EE] backdrop-blur-xl px-4 py-1.5 rounded-full text-[10px] font-bold tracking-wider border border-[#4361EE]/30 shadow-lg">
              AI BAYONNOMA FAOL
            </div>
          </div>

          {/* AI Summary Card */}
          {showAiSummary && (
            <div className="absolute bottom-[100px] left-1/2 -translate-x-1/2 w-full max-w-xl z-20 transition-all">
              <div className="bg-[#111218]/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-2xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-[#4361EE] font-bold text-[10px] tracking-widest">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI XULOSA
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2 text-base bg-white/5 rounded-full px-3 py-1 border border-white/5">
                      <span className="cursor-pointer hover:scale-125 transition-transform">👏</span>
                      <span className="cursor-pointer hover:scale-125 transition-transform">👍</span>
                      <span className="cursor-pointer hover:scale-125 transition-transform">❤️</span>
                      <span className="cursor-pointer hover:scale-125 transition-transform">🎉</span>
                      <span className="cursor-pointer hover:scale-125 transition-transform">😂</span>
                      <span className="cursor-pointer hover:scale-125 transition-transform opacity-50">😮</span>
                      <div className="w-[1px] h-4 bg-white/20 mx-1"></div>
                      <span className="cursor-pointer hover:scale-125 transition-transform grayscale">🙋</span>
                    </div>
                    <button onClick={() => setShowAiSummary(false)} className="text-gray-500 hover:text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed italic font-medium">
                  "Hozirda biz yangi dizayn palitrasi va foydalanuvchi interfeysini takomillashtirish masalalarini ko'rib chiqyapmiz. Nigora Saidova prototip bo'yicha o'z fikrlarini bildirdi..."
                </p>
              </div>
            </div>
          )}

          {/* Bottom Control Bar */}
          <div className="absolute bottom-0 left-0 w-full z-30">
            <div className="bg-[#111218] border-t border-white/5 px-6 py-4 flex items-center justify-between">
               {/* Left Section: Time & Info */}
               <div className="flex items-center gap-4 text-gray-400 font-medium text-[13px]">
                  <span>{timer}</span>
                  {activeParticipants.length > 1 && (
                     <span>| {activeParticipants.length} a'zolar</span>
                  )}
               </div>

               {/* Center Section: Controls */}
               <div className="flex items-center gap-2">
              <DockButton 
                active={micOn} 
                icon={micOn ? Mic : MicOff} 
                label="Mic" 
                color={micOn ? 'blue' : 'dark'}
                onClick={() => setMicOn(v => !v)} 
              />
              <DockButton 
                active={cameraOn} 
                icon={cameraOn ? Video : VideoOff} 
                label="Video" 
                onClick={() => setCameraOn(v => !v)} 
              />
              <DockButton 
                active={screenOn} 
                icon={MonitorUp} 
                label="Ulashish" 
                onClick={handleScreenShare} 
              />
              
              <div className="relative">
                <DockButton 
                  icon={MoreVertical} 
                  label="Yana" 
                  active={showMoreMenu}
                  onClick={() => setShowMoreMenu(!showMoreMenu)} 
                />
                
                {showMoreMenu && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-48 bg-[#161824] border border-white/10 rounded-xl shadow-2xl py-2 flex flex-col z-[300] animate-in fade-in slide-in-from-bottom-2">
                     <button 
                       onClick={handleCopyCode}
                       className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                     >
                       <Copy className="w-4 h-4" /> Kodni nusxalash
                     </button>
                     <button 
                       onClick={() => { setShowInvite(true); setShowMoreMenu(false); }}
                       className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                     >
                       <UserPlus className="w-4 h-4" /> Taklif qilish
                     </button>
                  </div>
                )}
              </div>

              <div className="w-[1px] h-10 bg-white/10 mx-2" />
              <DockButton 
                icon={Phone} 
                label="Tugatish" 
                color="red"
                onClick={onLeave} 
              />
              </div>

               {/* Right Section: Sidebar Toggles */}
               <div className="flex items-center gap-3">
                 <button 
                   onClick={() => {
                     if (!sidebarOpen) setSidebarOpen(true);
                     setSidebarTab('chat');
                   }}
                   className={cn("p-2.5 rounded-xl transition-all", sidebarOpen && sidebarTab === 'chat' ? "bg-[#4361EE]/10 text-[#4361EE]" : "text-gray-400 hover:bg-white/5 hover:text-white")}
                 >
                   <MessageSquare className="w-5 h-5" />
                 </button>
                 <button 
                   onClick={() => {
                     if (!sidebarOpen) setSidebarOpen(true);
                     setSidebarTab('participants');
                   }}
                   className={cn("p-2.5 rounded-xl transition-all", sidebarOpen && sidebarTab === 'participants' ? "bg-[#4361EE]/10 text-[#4361EE]" : "text-gray-400 hover:bg-white/5 hover:text-white")}
                 >
                   <Users className="w-5 h-5" />
                 </button>
                 <button 
                   onClick={() => {
                     if (!sidebarOpen) setSidebarOpen(true);
                     setSidebarTab('ai');
                   }}
                   className={cn("p-2.5 rounded-xl transition-all", sidebarOpen && sidebarTab === 'ai' ? "bg-[#4361EE]/10 text-[#4361EE]" : "text-gray-400 hover:bg-white/5 hover:text-white")}
                 >
                   <Sparkles className="w-5 h-5" />
                 </button>
               </div>
            </div>
          </div>
        </div>

        {/* Thumbnails Row */}
        <div className="absolute bottom-[90px] left-6 h-[120px] max-w-[calc(100%-48px)] shrink-0 flex gap-4 overflow-x-auto pb-1 hide-scrollbar z-20">
          {thumbnailParticipants.map((p) => (
            <ParticipantVideo
              key={p.id}
              p={{ ...p, cameraOff: p.isSelf ? (!cameraOn && !screenOn) : p.cameraOff, isMuted: p.isSelf ? !micOn : p.isMuted }}
              stream={p.isSelf ? localStream : remoteStreams[p.id]}
              className="w-[240px] rounded-2xl shrink-0 shadow-lg ring-1 ring-white/5"
            />
          ))}
          {remainingCount > 0 && (
            <div className="w-[240px] rounded-2xl shrink-0 bg-[#161824] flex flex-col items-center justify-center border border-white/5 shadow-lg">
              <span className="text-2xl font-bold text-white">+{remainingCount}</span>
              <span className="text-[10px] font-bold text-gray-500 tracking-wider mt-1">BOSHQALAR</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Area (Sidebar) ── */}
      {sidebarOpen && (
        <div className="w-[380px] shrink-0 bg-[#161824] border-l border-white/5 flex flex-col overflow-hidden z-40">
          {/* Sidebar Header */}
          <div className="px-5 py-5 flex items-start justify-between">
            <div>
              <h2 className="text-white font-bold text-[17px]">Uchrashuv tafsilotlari</h2>
              <div className="flex items-center gap-2 mt-1.5">
                <p className="text-gray-400 text-[13px] font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4361EE] shadow-[0_0_8px_#4361EE]" />
                  Xona: {title}
                </p>
                {meetingCode && (
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(meetingCode);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] font-bold text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Nusxa olindi' : 'Kod'}
                  </button>
                )}
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white transition-colors mt-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sidebar Tabs */}
          <div className="px-5 pb-5">
            <div className="grid grid-cols-3 gap-2">
              <TabButton icon={MessageSquare} label="Chat" active={sidebarTab === 'chat'} onClick={() => setSidebarTab('chat')} />
              <TabButton icon={Users} label="A'zolar" active={sidebarTab === 'participants'} onClick={() => setSidebarTab('participants')} />
              <TabButton icon={Sparkles} label="AI" active={sidebarTab === 'ai'} onClick={() => setSidebarTab('ai')} />
            </div>
          </div>

          {/* Sidebar Content: Chat */}
          {sidebarTab === 'chat' && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto px-5 space-y-5">
                {chatMessages.map((m, i) => (
                  <div key={i} className={cn("flex flex-col gap-1.5", m.isSelf ? "items-end" : "items-start")}>
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-[11px] font-semibold text-gray-400">{m.name}</span>
                      <span className="text-[10px] font-medium text-gray-500">{m.time}</span>
                    </div>
                    <div 
                      className={cn(
                        "px-4 py-3 text-[13px] font-medium leading-relaxed max-w-[85%]", 
                        m.isSelf 
                          ? "bg-[#4361EE] text-white rounded-[20px] rounded-tr-[4px] shadow-lg shadow-[#4361EE]/20" 
                          : "bg-[#222533] text-gray-200 rounded-[20px] rounded-tl-[4px]"
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-5 pt-3">
                <div className="relative">
                  <input
                    value={chatMsg}
                    onChange={(e) => setChatMsg(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    placeholder="Xabar yozing..."
                    className="w-full bg-[#1C1F2E] border border-white/5 rounded-full pl-5 pr-12 py-3.5 text-[13px] font-medium text-white placeholder:text-gray-500 focus:border-[#4361EE]/50 focus:ring-1 focus:ring-[#4361EE]/50 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleSendChat}
                    className="absolute right-1.5 top-1.5 bottom-1.5 w-10 bg-[#4361EE] rounded-full flex items-center justify-center hover:bg-[#4361EE]/90 transition-colors shadow-lg shadow-[#4361EE]/20"
                  >
                    <Send className="h-[15px] w-[15px] text-white ml-0.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sidebar Content: Participants */}
          {sidebarTab === 'participants' && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-5 pb-3">
                <button
                  onClick={() => setShowInvite(true)}
                  className="w-full flex items-center justify-center gap-2 bg-[#4361EE]/10 hover:bg-[#4361EE]/20 text-[#4361EE] border border-[#4361EE]/30 py-2.5 rounded-[12px] font-bold text-[13px] transition-colors"
                >
                  <UserPlus className="w-[18px] h-[18px]" /> Taklif qilish
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 space-y-2">
                 {activeParticipants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-2xl bg-[#1C1F2E] border border-white/5 px-3 py-2.5"
                  >
                    <div
                      className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-sm font-bold text-white shadow-lg"
                      style={{ background: p.color }}
                    >
                      {p.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col">
                        <span className="truncate text-[13px] font-bold text-gray-200">
                          {p.name} {p.isSelf && <span className="text-gray-500 font-medium">(Siz)</span>}
                        </span>
                        {p.isHost && (
                          <span className="text-[10px] font-bold text-[#4361EE]">Host</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('grid h-7 w-7 place-items-center rounded-full text-[11px]', p.isMuted ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-gray-400')}>
                        {p.isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                      </span>
                      <span className={cn('grid h-7 w-7 place-items-center rounded-full text-[11px]', p.cameraOff ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-gray-400')}>
                        {p.cameraOff ? <VideoOff className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sidebar Content: AI */}
          {sidebarTab === 'ai' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {aiMessages.length === 0 && (
                  <div className="text-center opacity-70 mt-8">
                    <Sparkles className="w-12 h-12 text-[#4361EE] mb-4 mx-auto" />
                    <p className="text-gray-300 text-sm font-medium">AI Meeting Assistant</p>
                    <p className="text-gray-500 text-xs mt-2">Savol bering — xulosa, eslatma yoki tushuntirish so'rang.</p>
                  </div>
                )}
                {aiMessages.map((m) => (
                  <div key={m.id} className={cn("flex", m.role === 'user' ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
                        m.role === 'user'
                          ? "bg-[#4361EE] text-white"
                          : "bg-white/5 text-gray-200 border border-white/5",
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-white/5">
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10 focus-within:border-[#4361EE]/50 transition-colors">
                  <input
                    value={aiDraft}
                    onChange={(e) => setAiDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
                    placeholder="AI'dan so'rang..."
                    disabled={aiLoading}
                    className="flex-1 bg-transparent text-[13px] text-white placeholder:text-gray-500 outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={sendAiMessage}
                    disabled={aiLoading || !aiDraft.trim()}
                    className="text-[#4361EE] disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80 transition-opacity"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}