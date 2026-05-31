import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { applyDir } from "@/i18n";
import { storage } from "@/utils/storage";
import type { UserProfile } from "@/types";
import LandingPage from "@/pages/LandingPage";
import NotFound from "@/pages/not-found";
import OnboardingPage from "@/pages/OnboardingPage";
import HomePage from "@/pages/HomePage";
import DashboardPage from "@/pages/DashboardPage";
import WorkspacePage from "@/pages/WorkspacePage";
import ChatPage from "@/pages/ChatPage";
import MeetingsPage from "@/pages/MeetingsPage";
import PremiumPage from "@/pages/PremiumPage";
import CommunityPage from "@/pages/CommunityPage";
import NewsPage from "@/pages/NewsPage";
import BankPage from "@/pages/BankPage";
import AssistantPage from "@/pages/AssistantPage";
import TeamsPage from "@/pages/TeamsPage";
import ProjectsPage from "@/pages/ProjectsPage";
import TasksNotesPage from "@/pages/TasksNotesPage";
import ProfilePage from "@/pages/ProfilePage";
import SettingsPage from "@/pages/SettingsPage";

const queryClient = new QueryClient();

type ProtectedPage = ComponentType<{ user: UserProfile; onLogout: () => void }>;

function DirSync() {
  const { i18n } = useTranslation();
  useEffect(() => {
    applyDir(i18n.language);
  }, [i18n.language]);
  return null;
}

function handleLogout() {
  storage.clearOnboarded();
  window.location.href = "/";
}

function renderProtected(Component: ProtectedPage) {
  const user = storage.getUser();
  if (!user || !storage.isOnboarded()) return <Redirect to="/onboarding" />;
  return <Component user={user} onLogout={handleLogout} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/app/home">{() => renderProtected(HomePage)}</Route>
      <Route path="/app/dashboard">{() => renderProtected(DashboardPage)}</Route>
      <Route path="/app/workspace">{() => renderProtected(WorkspacePage)}</Route>
      <Route path="/app/chat">{() => renderProtected(ChatPage)}</Route>
      <Route path="/app/meetings">{() => renderProtected(MeetingsPage)}</Route>
      <Route path="/app/premium">{() => renderProtected(PremiumPage)}</Route>
      <Route path="/app/projects">{() => renderProtected(ProjectsPage)}</Route>
      <Route path="/app/community">{() => renderProtected(CommunityPage)}</Route>
      <Route path="/app/news">{() => renderProtected(NewsPage)}</Route>
      <Route path="/app/bank">{() => renderProtected(BankPage)}</Route>
      <Route path="/app/assistant">{() => renderProtected(AssistantPage)}</Route>
      <Route path="/app/teams">{() => renderProtected(TeamsPage)}</Route>
      <Route path="/app/tasks">{() => renderProtected(TasksNotesPage)}</Route>
      <Route path="/app/profile">{() => renderProtected(ProfilePage)}</Route>
      <Route path="/app/settings">{() => renderProtected(SettingsPage)}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DirSync />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
