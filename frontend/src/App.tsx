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
  if (meetingMatch) return <MeetingRoomPage meetingId={meetingMatch[1]} />;

  return (
    <AppShell>
      <div className="route-transition">
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/chat" component={ChatPage} />
          <Route path="/meetings" component={MeetingsPage} />
          <Route path="/library" component={LibraryPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route><DashboardPage /></Route>
        </Switch>
      </div>
    </AppShell>
  );
}
