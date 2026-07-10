'use client';

import { useCallback, useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  Calendar,
  CalendarPlus,
  Copy,
  Loader2,
  Mic,
  Search,
  Video,
  VideoOff,
  CheckSquare,
  Sparkles
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { MeetingCallView } from "@/components/meeting/MeetingCallView";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/hooks/useAuth";
import { useMembers } from "@/hooks/useMembers";
import { useMeetings } from "@/hooks/useMeetings";
import { useProjects } from "@/hooks/useProjects";
import { useTasks } from "@/hooks/useTasks";
import { meetingsApi } from "@/lib/api";

function meetingStatus(meeting: { isActive?: boolean; startTime: string; endTime?: string }): 'live' | 'upcoming' | 'past' {
  const now = Date.now();
  const start = new Date(meeting.startTime).getTime();
  const end = meeting.endTime ? new Date(meeting.endTime).getTime() : start + 3600000;
  if (meeting.isActive) return 'live';
  if (start > now) return 'upcoming';
  return 'past';
}

export default function Page() {
  const { t } = useTranslation();
  const { activeWorkspace } = useWorkspace();
  const { backendUser } = useAuth();
  const { members } = useMembers(activeWorkspace?.id);
  const { meetings, loading: meetingsLoading, createMeeting, addMeeting } = useMeetings(activeWorkspace?.id);

  const [inCall, setInCall] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joiningCode, setJoiningCode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = searchParams.get('joinCode');
    if (code && !inCall && !joiningCode && !activeId) {
      setJoinCode(code);
      // Let's clear it from URL so we don't re-join automatically if user leaves and comes back
      router.replace('/app/meetings', { scroll: false });
      
      const autoJoin = async () => {
        setJoiningCode(true);
        try {
          const res = await meetingsApi.joinByCode(code);
          addMeeting(res.data);
          setActiveId(res.data.id);
          setInCall(true);
          showToast(`Joined: ${res.data.title}`);
        } catch {
          showToast("Meeting not found or expired");
        } finally {
          setJoiningCode(false);
        }
      };
      autoJoin();
    }
  }, [searchParams, inCall, joiningCode, activeId, addMeeting, router]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const activeMeeting = useMemo(
    () => meetings.find((m) => m.id === activeId) ?? meetings[0] ?? null,
    [activeId, meetings],
  );

  const upcomingMeetings = useMemo(
    () => meetings.filter((m) => meetingStatus(m) !== 'past').sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [meetings],
  );

  const pastMeetings = useMemo(
    () => meetings.filter((m) => meetingStatus(m) === 'past'),
    [meetings],
  );

  const selfMember = members.find((m) => m.userId === backendUser?.id);
  const callParticipants = useMemo(() => {
    const selfName = selfMember
      ? `${selfMember.user.firstName ?? ''} ${selfMember.user.lastName ?? ''}`.trim()
      : "Me";
    
    const selfParticipant = {
      id: backendUser?.id ?? "local-user",
      name: selfName || "Anonymous",
      initials: (selfName?.[0] ?? "M").toUpperCase(),
      color: "#6366F1",
      isSelf: true,
      isHost: activeMeeting?.hostId === backendUser?.id,
    };
    return [selfParticipant];
  }, [backendUser, selfMember, activeMeeting]);

  const handleJoinByCode = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setJoiningCode(true);
    try {
      const res = await meetingsApi.joinByCode(code);
      addMeeting(res.data);
      setActiveId(res.data.id);
      setInCall(true);
      showToast(`Joined: ${res.data.title}`);
    } catch {
      showToast("Meeting not found or expired");
    } finally {
      setJoiningCode(false);
    }
  };

  const handleCreateMeeting = async () => {
    try {
      const res = await createMeeting({
        title: `${backendUser?.email?.split('@')[0] || 'User'}'s Meeting`,
        startTime: new Date().toISOString(),
      });
      setActiveId(res.id);
      setInCall(true);
      showToast("Meeting started");
    } catch {
      showToast("Failed to start meeting");
    }
  };

  if (inCall && activeMeeting) {
    return (
      <MeetingCallView
        meetingId={activeMeeting.id}
        meetingCode={activeMeeting.code}
        title={activeMeeting.title}
        participants={callParticipants}
        workspaceMembers={members}
        currentUserId={backendUser?.id}
        onLeave={() => setInCall(false)}
      />
    );
  }

  // Active meeting for the large card
  const displayMeeting = activeMeeting || upcomingMeetings[0] || pastMeetings[0];

  return (
    <div className="min-h-screen text-white p-6 pb-20 overflow-y-auto font-sans">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-[#4361EE] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_0_20px_rgba(67,97,238,0.3)] transition-all animate-in fade-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}

      <div className="max-w-[1100px] mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex items-start justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[#4361EE] font-bold text-[10px] tracking-widest mb-3 uppercase">
              <div className="w-3 h-[2px] bg-[#4361EE]"></div> MEETINGS
            </div>
            <h1 className="text-[28px] font-bold tracking-tight mb-2.5 text-gray-100">
              Jamoa va mijoz qo&apos;ng&apos;iroqlari uchun lux<br/>video uchrashuvlar
            </h1>
            <p className="text-gray-400 text-[13px] font-medium leading-relaxed max-w-[480px]">
              Instant call, rejalashtirilgan session, team sync va screen sharing — bittasi joyida.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={handleCreateMeeting} className="flex items-center gap-2 bg-[#4361EE] hover:bg-[#4361EE]/90 transition-colors px-4 py-2.5 rounded-xl font-bold text-[13px] shadow-[0_0_20px_rgba(67,97,238,0.2)] text-white border border-[#4361EE]/50">
              <Video className="w-4 h-4" /> Yangi meeting
            </button>
            <button className="flex items-center gap-2 bg-[#12141D] hover:bg-[#1A1C28] transition-colors px-4 py-2.5 rounded-xl font-bold text-[13px] text-gray-300 border border-white/5">
              <CalendarPlus className="w-4 h-4" /> Rejalashtirish
            </button>
            <button className="flex items-center justify-center w-10 h-10 bg-[#12141D] hover:bg-[#1A1C28] transition-colors rounded-xl text-gray-400 border border-white/5">
              <Bell className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        {/* Grid Layout */}
        <div className="grid grid-cols-[1fr_380px] gap-5 items-start">
          
          {/* Left Column */}
          <div className="flex flex-col gap-5">
            
            {/* Main Meeting Card */}
            <div className="bg-[#12141D] rounded-[24px] border border-white/5 p-6 shadow-xl relative overflow-hidden">
              <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[#4361EE]/10 blur-[80px]" />
              
              <div className="relative z-10">
                {displayMeeting ? (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2 bg-[#10B981]/10 border border-[#10B981]/20 px-3 py-1.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981]"></span>
                        <span className="text-[11px] font-bold text-[#10B981]">Qo&apos;shilishga tayyor</span>
                      </div>
                      <div className="text-[11px] font-bold text-gray-500 tracking-wide">
                        15-iyun • 15:00
                      </div>
                    </div>

                    <h2 className="text-[22px] font-bold text-gray-100 mb-2.5">
                      {displayMeeting.title || "Mijoz bilan onboarding qo'ng'irog'i"}
                    </h2>
                    <p className="text-gray-400 text-[13px] leading-relaxed max-w-[500px] mb-5">
                      {displayMeeting.description || "Yangi mijozni platforma bilan tanishtirish, integratsiya bosqichlarini ko'rsatish va keyingi qadamlarni belgilash."}
                    </p>

                    <div className="flex items-center gap-2 mb-6">
                      <div className="flex items-center gap-1.5 bg-white/5 border border-white/5 px-3 py-1.5 rounded-[10px] text-[11px] font-bold text-gray-400">
                        <CheckSquare className="w-[14px] h-[14px]" />
                        Kirish • Demo • Savol-javob
                      </div>
                      <div className="flex items-center gap-1.5 bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-3 py-1.5 rounded-[10px] text-[11px] font-bold text-[#F59E0B]">
                        <Sparkles className="w-[14px] h-[14px]" />
                        AI yordamchi yoqilgan
                      </div>
                    </div>

                    {/* Participants Row */}
                    <div className="flex items-center gap-3 mb-8">
                       <div className="flex -space-x-2">
                         <div className="w-[34px] h-[34px] rounded-full bg-[#14B8A6] border-2 border-[#12141D] flex items-center justify-center text-[10px] font-bold text-white z-20">E</div>
                         <div className="w-[34px] h-[34px] rounded-full bg-[#F59E0B] border-2 border-[#12141D] flex items-center justify-center text-[10px] font-bold text-white z-10">ER</div>
                       </div>
                       <div className="text-[12px] font-medium text-gray-500">
                          <span className="text-gray-300 font-bold">elbek</span> • owner + Elbek Rustamjanov • junior
                       </div>
                    </div>

                    {/* Action Bar inside Main Card */}
                    <div className="flex items-center justify-between mt-auto bg-[#0B0D14] border border-white/5 p-3 rounded-[20px]">
                      <div className="flex items-center gap-3 pl-1">
                        <div className="w-10 h-10 bg-white/5 rounded-[12px] flex items-center justify-center border border-white/5">
                          <Video className="w-[18px] h-[18px] text-gray-400" />
                        </div>
                        <div>
                          <div className="text-[13px] font-bold text-gray-300 mb-0.5">Lobby preview</div>
                          <div className="text-[10px] font-medium text-gray-500 flex items-center gap-1.5">
                            <span className="w-2.5 h-3 border border-gray-500/50 rounded-[3px] border-t-2"></span>
                            End-to-end shifrlangan
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                         <button className="w-10 h-10 bg-[#161824] border border-white/5 hover:bg-white/10 rounded-[12px] flex items-center justify-center transition-colors">
                           <Mic className="w-[18px] h-[18px] text-gray-400" />
                         </button>
                         <button className="w-10 h-10 bg-[#161824] border border-white/5 hover:bg-white/10 rounded-[12px] flex items-center justify-center transition-colors">
                           <VideoOff className="w-[18px] h-[18px] text-gray-400" />
                         </button>
                         
                         <div className="flex items-center gap-2 bg-[#161824] border border-white/5 px-3 py-2.5 rounded-[12px] ml-1">
                            <span className="font-mono text-[12px] font-bold text-gray-300 tracking-wider">
                              {displayMeeting.code || "KZ-4F2-PLM"}
                            </span>
                            <button 
                              onClick={() => { navigator.clipboard.writeText(displayMeeting.code); showToast("Kod nusxalandi"); }}
                              className="text-gray-500 hover:text-white ml-1"
                            >
                              <Copy className="w-[14px] h-[14px]" />
                            </button>
                         </div>
                         
                         <button onClick={() => { setActiveId(displayMeeting.id); setInCall(true); }} className="flex items-center gap-2 bg-[#4361EE] hover:bg-[#4361EE]/90 transition-colors px-5 py-2.5 rounded-[12px] font-bold text-[13px] shadow-[0_0_20px_rgba(67,97,238,0.25)] border border-[#4361EE]/50 ml-1">
                           <Video className="w-4 h-4" /> Join Call
                         </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-16 flex flex-col items-center justify-center text-center opacity-70">
                    <Calendar className="w-12 h-12 text-gray-600 mb-4" />
                    <h2 className="text-lg font-bold text-gray-400">Meetinglar topilmadi</h2>
                    <p className="text-gray-500 text-[13px] mt-1.5 font-medium">Hozircha hech qanday reja yo&apos;q.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Split Cards */}
            <div className="grid grid-cols-2 gap-5">
               {/* Calendar View */}
               <div className="bg-[#12141D] rounded-[24px] border border-white/5 p-6 shadow-md">
                 <div className="flex items-center justify-between mb-6">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-[#4361EE]/10 rounded-[12px] flex items-center justify-center text-[#4361EE]">
                       <Calendar className="w-[18px] h-[18px]" />
                     </div>
                     <div>
                       <div className="text-[13px] font-bold text-gray-200">Calendar view</div>
                       <div className="text-[10px] font-medium text-gray-500 mt-0.5">Muddat bo&apos;yicha tartiblangan</div>
                     </div>
                   </div>
                   <div className="bg-[#4361EE]/10 text-[#4361EE] px-2.5 py-1 rounded-full text-[10px] font-bold">
                     1 ta
                   </div>
                 </div>

                 {/* Task Item */}
                 <div className="bg-[#0B0D14] border border-white/5 rounded-[16px] p-4 flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EF233C] mt-1.5 shadow-[0_0_8px_#EF233C]"></div>
                      <span className="text-[12px] font-bold text-gray-300 leading-snug">Mijozga shartnoma<br/>yuborish</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-[#EF233C]/10 text-[#EF233C] px-1.5 py-0.5 rounded-[6px] text-[9px] font-black tracking-wider">HIGH</span>
                      <span className="text-[11px] font-medium text-gray-500">26-iyun</span>
                    </div>
                 </div>
               </div>

               {/* Meeting -> Tasks */}
               <div className="bg-[#12141D] rounded-[24px] border border-white/5 p-6 shadow-md">
                 <div className="flex items-center gap-3 mb-6">
                     <div className="w-10 h-10 bg-[#4361EE]/10 rounded-[12px] flex items-center justify-center text-[#4361EE]">
                       <CheckSquare className="w-[18px] h-[18px]" />
                     </div>
                     <div>
                       <div className="text-[13px] font-bold text-gray-200">Meeting → Tasks</div>
                       <div className="text-[10px] font-medium text-gray-500 mt-0.5">Action item&apos;larni vazifaga aylantirish</div>
                     </div>
                 </div>

                 <div className="flex flex-col items-center justify-center h-[72px] opacity-40">
                    <CheckSquare className="w-6 h-6 text-gray-500 mb-2" />
                    <p className="text-[11px] font-medium text-center text-gray-500 max-w-[200px]">
                      Qo&apos;ng&apos;iroq tugagach, action item&apos;lar shu yerda paydo bo&apos;ladi.
                    </p>
                 </div>
               </div>
            </div>

          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-5">
            
            {/* Join Meeting Box */}
            <div className="bg-[#12141D] rounded-[24px] border border-white/5 p-6 relative overflow-hidden shadow-md">
              <div className="pointer-events-none absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-[#4361EE]/10 blur-[50px]" />
              
              <div className="flex items-center gap-3 mb-5 relative z-10">
                <div className="w-10 h-10 bg-[#4361EE]/10 rounded-[12px] flex items-center justify-center text-[#4361EE]">
                  <Search className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <div className="text-[13px] font-bold text-gray-200">Join meeting</div>
                  <div className="text-[10px] font-medium text-gray-500 mt-0.5">Kodni kiriting va darhol qo&apos;shiling</div>
                </div>
              </div>

              <div className="relative z-10 mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                  className="w-full bg-[#0B0D14] border border-white/5 rounded-[14px] pl-11 pr-4 py-3.5 text-[13px] text-white placeholder:text-gray-600 focus:outline-none focus:border-[#4361EE]/50 transition-colors shadow-inner"
                  placeholder="Masalan: KZ-4F2-PLM"
                />
              </div>

              <button 
                onClick={handleJoinByCode}
                disabled={!joinCode.trim() || joiningCode}
                className="w-full bg-[#4361EE] hover:bg-[#4361EE]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors py-3.5 rounded-[14px] flex items-center justify-center gap-2 font-bold text-[13px] shadow-[0_0_20px_rgba(67,97,238,0.25)] border border-[#4361EE]/50 relative z-10 text-white"
              >
                {joiningCode ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Video className="w-[18px] h-[18px]" />}
                Join
              </button>
            </div>

            {/* Upcoming Meetings Box */}
            <div className="bg-[#12141D] rounded-[24px] border border-white/5 p-6 flex flex-col shadow-md">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-white/5 rounded-[12px] flex items-center justify-center text-gray-400 border border-white/5">
                  <Calendar className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <div className="text-[13px] font-bold text-gray-200">Upcoming meetings</div>
                  <div className="text-[10px] font-medium text-gray-500 mt-0.5">Workspace uchun rejalashtirilgan</div>
                </div>
              </div>

              <div className="border border-dashed border-white/10 rounded-[16px] p-6 flex flex-col items-center justify-center mb-6">
                 <Calendar className="w-5 h-5 text-gray-600 mb-3 opacity-70" />
                 <p className="text-[11px] font-medium text-gray-500 mb-2">Hozircha reja yo&apos;q.</p>
                 <button className="text-[11px] font-bold text-[#4361EE] hover:text-[#4361EE]/80 transition-colors">
                   + Meeting rejalashtirish
                 </button>
              </div>

              <button className="text-[11px] font-bold text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5 mt-auto">
                <span className="text-[9px] font-black opacity-70">&gt;</span> O&apos;tgan meeting&apos;lar ({pastMeetings.length})
              </button>
            </div>

            {/* Stats Row */}
            <div className="bg-[#12141D] rounded-[24px] border border-white/5 flex items-center justify-between p-6 shadow-md">
               <div className="flex flex-col items-center flex-1">
                 <span className="text-[22px] font-bold text-white mb-0.5">{meetings.length || 1}</span>
                 <span className="text-[9px] font-bold text-gray-500 tracking-widest">TOTAL</span>
               </div>
               <div className="w-[1px] h-8 bg-white/5"></div>
               <div className="flex flex-col items-center flex-1">
                 <span className="text-[22px] font-bold text-white mb-0.5">{upcomingMeetings.filter(m => meetingStatus(m) === 'live').length}</span>
                 <span className="text-[9px] font-bold text-gray-500 tracking-widest">LIVE NOW</span>
               </div>
               <div className="w-[1px] h-8 bg-white/5"></div>
               <div className="flex flex-col items-center flex-1">
                 <span className="text-[22px] font-bold text-white mb-0.5">{upcomingMeetings.filter(m => meetingStatus(m) === 'upcoming').length}</span>
                 <span className="text-[9px] font-bold text-gray-500 tracking-widest">UPCOMING</span>
               </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
