import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { ThemeProvider } from "next-themes";
import { useTranslation } from "react-i18next";
import { applyDir } from "@/i18n";
import { storage } from "@/utils/storage";
import { Spinner } from "@/components/ui/spinner";
import type { UserProfile } from "@/types";

const LandingPage = lazy(() => import("@/pages/LandingPage"));
const NotFound = lazy(() => import("@/pages/not-found"));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const HomePage = lazy(() => import("@/pages/HomePage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const WorkspacePage = lazy(() => import("@/pages/WorkspacePage"));
const ChatPage = lazy(() => import("@/pages/ChatPage"));
const MeetingsPage = lazy(() => import("@/pages/MeetingsPage"));
const PremiumPage = lazy(() => import("@/pages/PremiumPage"));
const CommunityPage = lazy(() => import("@/pages/CommunityPage"));
const NewsPage = lazy(() => import("@/pages/NewsPage"));
const BankPage = lazy(() => import("@/pages/BankPage"));
const AssistantPage = lazy(() => import("@/pages/AssistantPage"));
const TeamsPage = lazy(() => import("@/pages/TeamsPage"));
const ProjectsPage = lazy(() => import("@/pages/ProjectsPage"));
const TasksNotesPage = lazy(() => import("@/pages/TasksNotesPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));

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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider>
          <DirSync />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="size-8 text-muted-foreground" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
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
    </Suspense>
  );
}

export default App;
