'use client';

import { useEffect, useRef, useState } from 'react';
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
  LayoutGrid,
  StretchHorizontal,
} from 'lucide-react';
import { cn } from '@/components/chat/chatShared';

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
  title: string;
  participants: Participant[];
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

function ParticipantTile({ p, large }: { p: Participant; large?: boolean }) {
  return (
    <div
      className={cn(
        'relative flex flex-col justify-between rounded-2xl overflow-hidden',
        'bg-[#252836] border',
        p.isSelf ? 'border-[#22C55E]' : 'border-[#2E3044]',
        large ? 'min-h-[200px]' : 'min-h-[160px]',
      )}
    >
      {/* Top badges */}
      <div className="flex items-center justify-between p-3">
        {p.isSelf && (
          <span className="rounded-md bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            Siz
          </span>
        )}
        {!p.isSelf && <span />}
        {p.isHost && (
          <span className="rounded-md bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            Host
          </span>
        )}
      </div>

      {/* Avatar */}
      <div className="flex flex-1 items-center justify-center">
        <div
          className="grid h-16 w-16 place-items-center rounded-full text-xl font-black text-white shadow-lg"
          style={{ background: p.color }}
        >
          {p.initials}
        </div>
      </div>

      {/* Bottom: name + controls */}
      <div className="flex items-end justify-between p-3">
        <span className="text-sm font-semibold text-white drop-shadow">{p.name}</span>
        <div className="flex items-center gap-1.5">
          {p.isMuted ? (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-red-500/80 text-white">
              <MicOff className="h-3 w-3" />
            </span>
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white">
              <Mic className="h-3 w-3" />
            </span>
          )}
          {p.cameraOff ? (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-red-500/80 text-white">
              <VideoOff className="h-3 w-3" />
            </span>
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-white">
              <Video className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  icon: Icon,
  label,
  active,
  danger,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-2xl px-4 py-2.5 transition-colors',
        danger
          ? 'bg-red-600 text-white hover:bg-red-500'
          : active
          ? 'bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/40'
          : 'bg-white/10 text-gray-300 hover:bg-white/15',
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

export function MeetingCallView({ title, participants, onLeave }: MeetingCallViewProps) {
  const startedAt = useRef(Date.now()).current;
  const timer = useTimer(startedAt);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'participants' | 'chat'>('participants');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [layout, setLayout] = useState<'grid' | 'strip'>('grid');
  const [chatMsg, setChatMsg] = useState('');
  const [chatMessages, setChatMessages] = useState<{ name: string; text: string }[]>([]);

  const self = participants.find((p) => p.isSelf) ?? participants[0];

  const handleSendChat = () => {
    const text = chatMsg.trim();
    if (!text) return;
    setChatMessages((prev) => [...prev, { name: self?.name ?? 'Siz', text }]);
    setChatMsg('');
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#12141E] text-white">
      {/* ── Top bar ── */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-white/8 px-4">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-white">{title}</span>
          <span className="font-mono text-sm text-gray-400">{timer}</span>
          <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-400">
            {participants.length} ishtirokchi
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLayout('grid')}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-xl transition-colors',
              layout === 'grid' ? 'bg-white/15 text-white' : 'text-gray-400 hover:bg-white/10',
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setLayout('strip')}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-xl transition-colors',
              layout === 'strip' ? 'bg-white/15 text-white' : 'text-gray-400 hover:bg-white/10',
            )}
          >
            <StretchHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Video grid */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          <div
            className={cn(
              'grid gap-3',
              layout === 'grid'
                ? participants.length <= 1
                  ? 'grid-cols-1'
                  : participants.length === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-2'
                : 'grid-cols-1',
            )}
          >
            {participants.map((p) => (
              <ParticipantTile key={p.id} p={p} large={participants.length <= 2} />
            ))}
          </div>
        </div>

        {/* Right sidebar */}
        {sidebarOpen && (
          <div className="flex w-72 flex-shrink-0 flex-col border-l border-white/8">
            {/* Tabs */}
            <div className="flex flex-shrink-0 border-b border-white/8">
              <button
                type="button"
                onClick={() => setSidebarTab('participants')}
                className={cn(
                  'flex-1 py-3 text-sm font-semibold transition-colors',
                  sidebarTab === 'participants'
                    ? 'border-b-2 border-indigo-500 text-white'
                    : 'text-gray-400 hover:text-gray-300',
                )}
              >
                Ishtirokchilar
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('chat')}
                className={cn(
                  'flex-1 py-3 text-sm font-semibold transition-colors',
                  sidebarTab === 'chat'
                    ? 'border-b-2 border-indigo-500 text-white'
                    : 'text-gray-400 hover:text-gray-300',
                )}
              >
                Chat
              </button>
            </div>

            {sidebarTab === 'participants' && (
              <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-1">
                {participants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-white/5"
                  >
                    <div
                      className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                      style={{ background: p.color }}
                    >
                      {p.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-white">
                          {p.name}
                        </span>
                        {p.isSelf && (
                          <span className="text-[10px] text-gray-400">(Siz)</span>
                        )}
                        {p.isHost && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300">
                            Host
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {p.isSelf && (
                        <span className="h-2 w-2 rounded-full bg-green-400" />
                      )}
                      <span className={cn('grid h-6 w-6 place-items-center rounded-full text-xs', p.isMuted ? 'text-red-400' : 'text-gray-400')}>
                        {p.isMuted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                      </span>
                      <span className={cn('grid h-6 w-6 place-items-center rounded-full text-xs', p.cameraOff ? 'text-red-400' : 'text-gray-400')}>
                        {p.cameraOff ? <VideoOff className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sidebarTab === 'chat' && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
                  {chatMessages.length === 0 && (
                    <p className="pt-8 text-center text-sm text-gray-500">
                      Hali hech kim yozmagan
                    </p>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i} className="space-y-0.5">
                      <span className="text-xs font-semibold text-gray-400">{m.name}</span>
                      <p className="rounded-xl bg-white/8 px-3 py-2 text-sm text-white">{m.text}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 border-t border-white/8 p-3">
                  <input
                    value={chatMsg}
                    onChange={(e) => setChatMsg(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    placeholder="Xabar yozing..."
                    className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSendChat}
                    className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom controls ── */}
      <div className="flex flex-shrink-0 items-center justify-center gap-2 border-t border-white/8 px-4 py-3">
        <ControlButton
          icon={micOn ? Mic : MicOff}
          label="Mikrofon"
          active={micOn}
          onClick={() => setMicOn((v) => !v)}
        />
        <ControlButton
          icon={cameraOn ? Video : VideoOff}
          label="Kamera"
          active={cameraOn}
          onClick={() => setCameraOn((v) => !v)}
        />
        <ControlButton
          icon={Monitor}
          label="Ekran"
          active={screenOn}
          onClick={() => setScreenOn((v) => !v)}
        />
        <ControlButton
          icon={Hand}
          label="Qo'l"
          active={handRaised}
          onClick={() => setHandRaised((v) => !v)}
        />
        <ControlButton
          icon={Users}
          label="A'zolar"
          active={sidebarOpen && sidebarTab === 'participants'}
          onClick={() => {
            setSidebarTab('participants');
            setSidebarOpen((v) => sidebarTab !== 'participants' ? true : !v);
          }}
        />
        <ControlButton
          icon={MessageSquare}
          label="Chat"
          active={sidebarOpen && sidebarTab === 'chat'}
          onClick={() => {
            setSidebarTab('chat');
            setSidebarOpen((v) => sidebarTab !== 'chat' ? true : !v);
          }}
        />
        <ControlButton icon={PhoneOff} label="Chiqish" danger onClick={onLeave} />
      </div>
    </div>
  );
}
