import { LoaderCircle } from "lucide-react";
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

function LoadingScreen() {
  return <div className="app-loading"><Logo /><LoaderCircle className="spin" size={23} /><span>Workspace yuklanmoqda</span></div>;
}

export function App() {
  const { ready, user, workspace } = useAuth();
  const [location] = useLocation();
  if (!ready) return <LoadingScreen />;
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
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/chat" component={ChatPage} />
        <Route path="/meetings" component={MeetingsPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route><DashboardPage /></Route>
      </Switch>
    </AppShell>
  );
}
