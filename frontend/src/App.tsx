import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { AppShell } from "./components/AppShell";
import { Logo } from "./components/ui";
import { useAuth } from "./lib/auth";
import { AuthPage } from "./pages/AuthPage";
import { ChatPage } from "./pages/ChatPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MeetingRoomPage } from "./pages/MeetingRoomPage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { InvitePage } from "./pages/InvitePage";
import { WorkspaceSetupPage } from "./pages/WorkspaceSetupPage";
import { PublicProfilePage } from "./pages/PublicProfilePage";
import { LibraryPage } from "./pages/LibraryPage";
import { EducationPage } from "./pages/EducationPage";

function LoadingScreen() {
  return <div className="app-loading"><Logo /><LoaderCircle className="spin" size={23} /><span>Workspace yuklanmoqda</span></div>;
}

export function App() {
  const { ready, user, workspace } = useAuth();
  const [location] = useLocation();
  useEffect(() => {
    document.documentElement.dataset.theme = user
      ? localStorage.getItem("optima-theme") === "dark" ? "dark" : "light"
      : "light";
  }, [user]);
  if (!ready) return <LoadingScreen />;
  const publicProfileMatch = location.match(/^\/(?:u|user)\/([^/?#]+)$/);
  if (publicProfileMatch) return <PublicProfilePage identifier={decodeURIComponent(publicProfileMatch[1])} />;
  if (!user) return <AuthPage />;

  const chatInviteMatch = location.match(/^\/join\/chat\/([^/?#]+)$/);
  if (chatInviteMatch) return <InvitePage kind="chat" token={decodeURIComponent(chatInviteMatch[1])} />;

  if (location === "/auth/accept-invite") {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) return <InvitePage kind="workspace" token={token} />;
  }

  if (!workspace) return <WorkspaceSetupPage />;

  const meetingMatch = location.match(/^\/meetings\/([^/]+)$/);
  const isEducation = location === "/education" || location.startsWith("/education/");
  const isChat = location === "/chat";

  const mainContent = meetingMatch ? (
    <MeetingRoomPage meetingId={meetingMatch[1]} />
  ) : (
    <AppShell>
      <div className="route-transition" key={isEducation ? "/education" : location}>
        {isEducation ? <EducationPage /> : isChat ? null : (
          <Switch>
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
      {/* Always the second child of this same fragment, in a stable
          position regardless of which branch mainContent takes (meeting
          room vs. the normal app shell) - that's what lets React keep this
          one instance mounted (socket, messages, minimized state and all)
          instead of remounting it when navigating into/out of a meeting. */}
      <ChatPage />
    </>
  );
}
