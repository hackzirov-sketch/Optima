import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { AppShell } from "./components/AppShell";
import { Logo } from "./components/ui";
import { useAuth } from "./lib/auth";
import { AuthPage } from "./pages/AuthPage";
import { ChatPage } from "./pages/ChatPage";
import { AiPage } from "./pages/AiPage";
import { YoutubePage } from "./pages/YoutubePage";
import { StatisticsPage } from "./pages/StatisticsPage";
import { UsageTracker } from "./components/UsageTracker";
import { DashboardPage } from "./pages/DashboardPage";
import { MeetingRoomPage } from "./pages/MeetingRoomPage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { InvitePage } from "./pages/InvitePage";
import { PublicProfilePage } from "./pages/PublicProfilePage";
import { LibraryPage } from "./pages/LibraryPage";
import { EducationPage } from "./pages/EducationPage";

function LoadingScreen() {
  return <div className="app-loading"><Logo /><LoaderCircle className="spin" size={23} /><span>Group yuklanmoqda</span></div>;
}

function WorkspaceLoading() {
  const { refreshWorkspaces, logout } = useAuth();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    refreshWorkspaces().then((items) => { if (!cancelled && !items.length) setFailed(true); }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [refreshWorkspaces]);
  if (!failed) return <LoadingScreen />;
  return <div className="app-loading"><Logo /><span>Yuklab bo‘lmadi</span>
    <button className="button" onClick={() => window.location.reload()}>Qayta urinish</button>
    <button className="text-button" onClick={() => void logout()}>Chiqish</button></div>;
}

export function App() {
  const { ready, user, group } = useAuth();
  const [location] = useLocation();
  useEffect(() => {
    document.documentElement.dataset.theme = user
      ? localStorage.getItem("optima-theme") === "dark" ? "dark" : "light"
      : "light";
  }, [user]);
  if (!ready) return <LoadingScreen />;
  // /profile/:id is the public profile view. /user/:id is kept as a legacy alias
  // (old shared links) — it used to also serve /u/:id, but that prefix now opens
  // a DM (see chatUserMatch below), per the chat route redesign.
  const publicProfileMatch = location.match(/^\/(?:profile|user)\/([^/?#]+)$/);
  if (publicProfileMatch) return <PublicProfilePage identifier={decodeURIComponent(publicProfileMatch[1])} />;
  if (!user) return <AuthPage />;

  const chatInviteMatch = location.match(/^\/join\/chat\/([^/?#]+)$/);
  if (chatInviteMatch) return <InvitePage kind="chat" token={decodeURIComponent(chatInviteMatch[1])} />;

  if (location === "/auth/accept-invite") {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) return <InvitePage kind="group" token={token} />;
  }

  // Every account has a group — the server makes a personal one on first
  // load — so a missing one means the list call failed: retry, never ask.
  if (!group) return <WorkspaceLoading />;

  const isEducation = location === "/education" || location.startsWith("/education/");
  // Chat route redesign: /u/:id (DM), /g/:slug-or-publicId (group), /ch/:slug-or-publicId
  // (channel) — resolved to an internal room id inside ChatPage, never used directly as one.
  const chatUserMatch = location.match(/^\/u\/([^/?#]+)/);
  const chatGroupMatch = location.match(/^\/g\/([^/?#]+)/);
  const chatChannelMatch = location.match(/^\/ch\/([^/?#]+)/);
  const chatRouteTarget = chatUserMatch
    ? { type: "direct" as const, identifier: decodeURIComponent(chatUserMatch[1]) }
    : chatGroupMatch
    ? { type: "group" as const, identifier: decodeURIComponent(chatGroupMatch[1]) }
    : chatChannelMatch
    ? { type: "channel" as const, identifier: decodeURIComponent(chatChannelMatch[1]) }
    : null;
  const isChat = location === "/chat" || Boolean(chatRouteTarget);

  const mainContent = (
    <AppShell>
      <div className="route-transition" key={isEducation ? "/education" : location}>
        {isEducation ? <EducationPage /> : isChat ? null : (
          <Switch>
            <Route path="/ai" component={AiPage} />
            <Route path="/youtube" component={YoutubePage} />
            <Route path="/statistics" component={StatisticsPage} />
            <Route path="/" component={DashboardPage} />
            <Route path="/meetings" component={MeetingsPage} />
            <Route path="/library" component={LibraryPage} />
            <Route path="/profile" component={ProfilePage} />
            <Route><DashboardPage /></Route>
          </Switch>
        )}
      </div>
    </AppShell>
  );

  return (
    <>
      {mainContent}
      <UsageTracker />
      {/* MeetingRoomPage (no meetingId prop = the standalone instance) is
          mounted here unconditionally, same reasoning as ChatPage below: it
          renders its own full-screen UI on top of everything via CSS when
          on /meetings/:id, a small floating widget when the user has
          navigated elsewhere mid-call, and nothing otherwise — never
          torn down by a route change, so leaving the page doesn't hang up. */}
      <MeetingRoomPage />
      {/* Always the second child of this same fragment, in a stable
          position regardless of which branch mainContent takes (meeting
          room vs. the normal app shell) - that's what lets React keep this
          one instance mounted (socket, messages, minimized state and all)
          instead of remounting it when navigating into/out of a meeting. */}
      <ChatPage routeTarget={chatRouteTarget} />
    </>
  );
}
