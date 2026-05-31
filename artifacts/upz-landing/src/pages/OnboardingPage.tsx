import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle2,
  Chrome,
  Code2,
  Eye,
  EyeOff,
  Github,
  GraduationCap,
  Lock,
  Mail,
  Megaphone,
  Palette,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  Video,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { LanguageSwitcher } from "@/components/landing/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Experience, Goal, Profession, UserProfile } from "@/types";
import { storage } from "@/utils/storage";

type AuthMode = "signin" | "signup";
type LoginMethod = "email" | "phone";
type WizardStep = "auth" | "profession" | "goal" | "experience";
const PREMIUM_LOGIN = "premium";
const PREMIUM_PASSWORD = "premium123";

const PROFESSIONS: { id: Profession; icon: ReactNode; desc: string }[] = [
  { id: "developer", icon: <Code2 className="h-5 w-5" />, desc: "Software, products, systems" },
  { id: "teacher", icon: <GraduationCap className="h-5 w-5" />, desc: "Courses, students, lessons" },
  { id: "student", icon: <BookOpen className="h-5 w-5" />, desc: "Learning, notes, growth" },
  { id: "freelancer", icon: <Briefcase className="h-5 w-5" />, desc: "Clients, income, delivery" },
  { id: "designer", icon: <Palette className="h-5 w-5" />, desc: "UI, brand, creative work" },
  { id: "smm", icon: <Megaphone className="h-5 w-5" />, desc: "Content, campaigns, reach" },
  { id: "creator", icon: <Video className="h-5 w-5" />, desc: "Media, audience, publishing" },
];

const GOALS: { id: Goal; accent: string }[] = [
  { id: "learn", accent: "#10B981" },
  { id: "find_work", accent: "#3B82F6" },
  { id: "manage_team", accent: "#6366F1" },
  { id: "build_portfolio", accent: "#F59E0B" },
  { id: "freelance", accent: "#EF4444" },
];

const EXPERIENCES: { id: Experience; desc: string; color: string }[] = [
  { id: "beginner", desc: "Just getting started", color: "#10B981" },
  { id: "intermediate", desc: "Already building momentum", color: "#3B82F6" },
  { id: "advanced", desc: "Ready for serious systems", color: "#8B5CF6" },
];

function createDemoProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: "Ahmad",
    profession: "student",
    goal: "find_work",
    experience: "intermediate",
    joinedAt: Date.now(),
    isPremium: false,
    ...overrides,
  };
}

function AuthField({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  action,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  action?: ReactNode;
}) {
  return (
    <label className="group block">
      <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#6B7280] dark:text-slate-400">
        {icon}
        {label}
      </span>
      <span className="flex h-13 items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] px-4 shadow-sm transition-all group-focus-within:border-indigo-300 group-focus-within:bg-white group-focus-within:ring-4 group-focus-within:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900/75 dark:group-focus-within:border-indigo-400/60 dark:group-focus-within:bg-slate-950 dark:group-focus-within:ring-indigo-500/15">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#111827] outline-none placeholder:text-[#9CA3AF] dark:text-white dark:placeholder:text-slate-500"
        />
        {action}
      </span>
    </label>
  );
}

function ProviderButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-[22px] border border-[#E5E7EB] bg-white p-3 text-xs font-bold text-[#6B7280] shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:text-[#111827] hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:border-indigo-400/50 dark:hover:text-white"
    >
      <span className="text-[#111827] dark:text-white">{icon}</span>
      {label}
    </button>
  );
}

function StepPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className="flex items-center gap-2 text-xs font-bold text-[#6B7280] dark:text-slate-400">
      <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"}`} />
      {label}
    </span>
  );
}

export default function OnboardingPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const initialMode = typeof window !== "undefined" && window.location.search.includes("mode=signin") ? "signin" : "signup";
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [step, setStep] = useState<WizardStep>("auth");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [signinIdentifier, setSigninIdentifier] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [profession, setProfession] = useState<Profession | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);

  const profileSteps: WizardStep[] = ["profession", "goal", "experience"];
  const stepIndex = step === "auth" ? 0 : profileSteps.indexOf(step) + 1;
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const signupReady =
    fullName.trim().length > 1 &&
    email.includes("@") &&
    phone.trim().length >= 7 &&
    username.trim().length > 2 &&
    password.length >= 6 &&
    password === confirmPassword &&
    acceptedTerms;
  const signinReady = true;
  const profileReady = (step === "profession" && profession) || (step === "goal" && goal) || (step === "experience" && experience);

  const primaryName = useMemo(() => {
    if (fullName.trim()) return fullName.trim();
    if (signinIdentifier.includes("@")) return signinIdentifier.split("@")[0] || "User";
    return "Ahmad";
  }, [fullName, signinIdentifier]);

  const saveAndEnter = (profile: Partial<UserProfile> = {}) => {
    storage.saveUser(createDemoProfile(profile));
    storage.setOnboarded();
    navigate("/app/home");
  };

  const handleSignin = () => {
    const existing = storage.getUser();
    const premiumLogin = signinIdentifier.trim().toLowerCase() === PREMIUM_LOGIN && signinPassword === PREMIUM_PASSWORD;
    saveAndEnter({
      ...existing,
      name: premiumLogin ? "Premium User" : existing?.name ?? primaryName,
      email: loginMethod === "email" ? signinIdentifier : existing?.email,
      phone: loginMethod === "phone" ? signinIdentifier : existing?.phone,
      isPremium: premiumLogin,
    });
  };

  const handleSocialDemo = (provider: string) => {
    saveAndEnter({
      name: `${provider} User`,
      authProvider: provider.toLowerCase(),
      email: undefined,
      phone: undefined,
      isPremium: false,
    });
  };

  const handleCreateAccount = () => {
    if (signupReady) setStep("profession");
  };

  const handleFinish = () => {
    if (!profession || !goal || !experience) return;
    saveAndEnter({
      name: fullName.trim() || "User",
      profession,
      goal,
      experience,
      email,
      phone,
      username,
      joinedAt: Date.now(),
      isPremium: false,
    });
  };

  const goBack = () => {
    if (step === "auth") {
      navigate("/");
      return;
    }
    const currentIndex = profileSteps.indexOf(step);
    setStep(currentIndex <= 0 ? "auth" : profileSteps[currentIndex - 1]);
  };

  const goNextProfile = () => {
    if (step === "profession" && profession) setStep("goal");
    if (step === "goal" && goal) setStep("experience");
    if (step === "experience" && experience) handleFinish();
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F7FAFC] px-4 py-6 text-[#111827] dark:bg-[#08111F] dark:text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(99,102,241,0.16),transparent_32%),radial-gradient(circle_at_90%_14%,rgba(59,130,246,0.12),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.92),rgba(247,250,252,0.84))] dark:bg-[radial-gradient(circle_at_12%_4%,rgba(99,102,241,0.22),transparent_32%),radial-gradient(circle_at_90%_14%,rgba(59,130,246,0.18),transparent_30%),linear-gradient(135deg,rgba(8,17,31,0.96),rgba(15,23,42,0.94))]" />
      <div className="pointer-events-none absolute -left-20 top-24 h-72 w-72 rounded-full bg-indigo-200/35 blur-3xl dark:bg-indigo-500/10" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-blue-200/45 blur-3xl dark:bg-blue-500/10" />

      <div className="relative mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-7xl flex-col">
        <header className="mb-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate("/")} className="group flex min-w-0 items-center gap-3 text-left">
            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-sm font-black text-white shadow-lg shadow-indigo-200 transition-transform group-hover:scale-105 dark:shadow-indigo-950/30">
              U
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-black tracking-tight">Optima</span>
              <span className="hidden truncate text-xs font-semibold text-[#6B7280] dark:text-slate-400 sm:block">Optima</span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <LanguageSwitcher />
          </div>
        </header>

        <section className="grid flex-1 overflow-hidden rounded-[34px] border border-[#E5E7EB] bg-white/86 shadow-2xl shadow-slate-200/70 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/72 dark:shadow-black/30 lg:grid-cols-[0.95fr_1.05fr]">
          <aside className="relative hidden overflow-hidden border-r border-[#E5E7EB] bg-[#111827] p-8 text-white dark:border-slate-800 lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(99,102,241,0.45),transparent_32%),radial-gradient(circle_at_86%_20%,rgba(59,130,246,0.32),transparent_30%),linear-gradient(145deg,#0B1120,#111827_55%,#172033)]" />
            <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />

            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-indigo-100 backdrop-blur">
                <ShieldCheck className="h-4 w-4" />
                {t("app.onboarding.secureAccess")}
              </span>
              <h1 className="mt-7 max-w-lg text-4xl font-black tracking-tight xl:text-5xl">
                {t("app.onboarding.heroTitle")}
              </h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">
                {t("app.onboarding.heroDesc")}
              </p>
            </div>

            <div className="relative grid gap-3">
              {[
                [t("app.onboarding.side.multiTitle"), t("app.onboarding.side.multiDesc")],
                [t("app.onboarding.side.registrationTitle"), t("app.onboarding.side.registrationDesc")],
                [t("app.onboarding.side.readyTitle"), t("app.onboarding.side.readyDesc")],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-[24px] border border-white/10 bg-white/[0.07] p-4 backdrop-blur-xl">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-2xl bg-white/10 text-indigo-100">
                      <Check className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-black">{title}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-400">{desc}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="flex min-h-[720px] flex-col p-4 sm:p-6 lg:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-bold text-[#6B7280] shadow-sm transition-all hover:-translate-y-0.5 hover:text-[#111827] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("app.common.back")}
              </button>
              <div className="hidden items-center gap-2 sm:flex">
                {[t("app.onboarding.steps.account"), t("app.onboarding.steps.role"), t("app.onboarding.steps.goal"), t("app.onboarding.steps.level")].map((label, index) => (
                  <StepPill key={label} label={label} active={index <= stepIndex} />
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {step === "auth" ? (
                <motion.div
                  key="auth"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.22 }}
                  className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-4"
                >
                  <div className="mb-7 text-center sm:text-left">
                    <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-200 dark:ring-indigo-400/20">
                      <Sparkles className="h-4 w-4" />
                      {t("app.onboarding.accountBadge")}
                    </span>
                    <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                      {authMode === "signup" ? t("app.onboarding.createTitle") : t("app.onboarding.welcomeBack")}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-[#6B7280] dark:text-slate-400">
                      {authMode === "signup"
                        ? t("app.onboarding.createDesc")
                        : t("app.onboarding.signinDesc")}
                    </p>
                  </div>

                  <div className="mb-5 grid grid-cols-2 rounded-[22px] border border-[#E5E7EB] bg-[#F7FAFC] p-1 dark:border-slate-700 dark:bg-slate-900/80">
                    {[
                      ["signin", t("app.onboarding.signIn")],
                      ["signup", t("app.onboarding.createAccount")],
                    ].map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setAuthMode(mode as AuthMode)}
                        className={`rounded-[18px] px-4 py-3 text-sm font-black transition-all ${
                          authMode === mode
                            ? "bg-white text-[#111827] shadow-sm dark:bg-slate-800 dark:text-white"
                            : "text-[#6B7280] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {authMode === "signin" ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#F7FAFC] p-1 dark:bg-slate-900/80">
                        <button
                          type="button"
                          onClick={() => setLoginMethod("email")}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${loginMethod === "email" ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-200" : "text-[#6B7280] dark:text-slate-400"}`}
                        >
                          <Mail className="h-4 w-4" />
                          {t("app.onboarding.email")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setLoginMethod("phone")}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${loginMethod === "phone" ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-200" : "text-[#6B7280] dark:text-slate-400"}`}
                        >
                          <Phone className="h-4 w-4" />
                          {t("app.onboarding.phone")}
                        </button>
                      </div>

                      <AuthField
                        icon={loginMethod === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                        label={loginMethod === "email" ? t("app.onboarding.emailAddress") : t("app.onboarding.phoneNumber")}
                        value={signinIdentifier}
                        onChange={setSigninIdentifier}
                        placeholder={loginMethod === "email" ? "you@example.com" : "+998 90 123 45 67"}
                        type={loginMethod === "email" ? "email" : "tel"}
                        autoComplete={loginMethod === "email" ? "email" : "tel"}
                      />
                      <AuthField
                        icon={<Lock className="h-4 w-4" />}
                        label={t("app.onboarding.password")}
                        value={signinPassword}
                        onChange={setSigninPassword}
                        placeholder="Enter your password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        action={
                          <button type="button" onClick={() => setShowPassword((current) => !current)} className="text-[#6B7280] hover:text-[#111827] dark:hover:text-white" aria-label={t("app.onboarding.togglePassword")}>
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        }
                      />

                      <div className="flex justify-end">
                        <button type="button" className="text-sm font-black text-indigo-600 hover:text-indigo-500 dark:text-indigo-300">
                          {t("app.onboarding.forgotPassword")}
                        </button>
                      </div>

                      <motion.button
                        type="button"
                        onClick={handleSignin}
                        disabled={!signinReady}
                        whileTap={{ scale: 0.98 }}
                        className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 text-sm font-black text-white shadow-lg shadow-indigo-200 transition-all hover:from-indigo-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-45 dark:shadow-indigo-950/30"
                      >
                        {signinIdentifier.trim().toLowerCase() === PREMIUM_LOGIN ? t("app.onboarding.signInPremium") : t("app.onboarding.continueFree")}
                        <ArrowRight className="h-4 w-4" />
                      </motion.button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <AuthField icon={<User className="h-4 w-4" />} label={t("app.onboarding.fullName")} value={fullName} onChange={setFullName} placeholder="Jasur Karimov" autoComplete="name" />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <AuthField icon={<Mail className="h-4 w-4" />} label={t("app.onboarding.email")} value={email} onChange={setEmail} placeholder="your@email.com" type="email" autoComplete="email" />
                        <AuthField icon={<Phone className="h-4 w-4" />} label={t("app.onboarding.phone")} value={phone} onChange={setPhone} placeholder="+998 90 123 45 67" type="tel" autoComplete="tel" />
                      </div>
                      <AuthField icon={<AtSign className="h-4 w-4" />} label={t("app.onboarding.username")} value={username} onChange={setUsername} placeholder="@jasur_karimov" autoComplete="username" />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <AuthField
                          icon={<Lock className="h-4 w-4" />}
                          label={t("app.onboarding.password")}
                          value={password}
                          onChange={setPassword}
                          placeholder="Create a strong password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          action={
                            <button type="button" onClick={() => setShowPassword((current) => !current)} className="text-[#6B7280] hover:text-[#111827] dark:hover:text-white" aria-label={t("app.onboarding.togglePassword")}>
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          }
                        />
                        <AuthField
                          icon={<Lock className="h-4 w-4" />}
                          label={t("app.onboarding.confirmPassword")}
                          value={confirmPassword}
                          onChange={setConfirmPassword}
                          placeholder="Repeat your password"
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          action={
                            <button type="button" onClick={() => setShowConfirmPassword((current) => !current)} className="text-[#6B7280] hover:text-[#111827] dark:hover:text-white" aria-label={t("app.onboarding.toggleConfirmPassword")}>
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          }
                        />
                      </div>
                      {passwordMismatch && <p className="text-sm font-bold text-rose-600">{t("app.onboarding.passwordMismatch")}</p>}

                      <label className="flex items-start gap-3 rounded-2xl bg-[#F7FAFC] p-3 text-sm text-[#6B7280] dark:bg-slate-900/70 dark:text-slate-400">
                        <button
                          type="button"
                          onClick={() => setAcceptedTerms((current) => !current)}
                          className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-lg border transition-all ${acceptedTerms ? "border-indigo-500 bg-indigo-500 text-white" : "border-[#D1D5DB] bg-white dark:border-slate-600 dark:bg-slate-950"}`}
                          aria-label={t("app.onboarding.acceptTerms")}
                        >
                          {acceptedTerms && <Check className="h-3.5 w-3.5" />}
                        </button>
                        <span>
                          {t("app.onboarding.termsPrefix")} <span className="font-black text-indigo-600 dark:text-indigo-300">{t("app.onboarding.terms")}</span> {t("app.onboarding.and")} <span className="font-black text-indigo-600 dark:text-indigo-300">{t("app.onboarding.privacy")}</span>.
                        </span>
                      </label>

                      <motion.button
                        type="button"
                        onClick={handleCreateAccount}
                        disabled={!signupReady}
                        whileTap={signupReady ? { scale: 0.98 } : undefined}
                        className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 text-sm font-black text-white shadow-lg shadow-indigo-200 transition-all hover:from-indigo-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-45 dark:shadow-indigo-950/30"
                      >
                        {t("app.onboarding.createAccount")}
                        <ArrowRight className="h-4 w-4" />
                      </motion.button>
                    </div>
                  )}

                  <div className="my-6 flex items-center gap-3 text-xs font-bold text-[#9CA3AF]">
                    <span className="h-px flex-1 bg-[#E5E7EB] dark:bg-slate-800" />
                    {authMode === "signup" ? t("app.onboarding.orSignUpWith") : t("app.onboarding.orContinueWith")}
                    <span className="h-px flex-1 bg-[#E5E7EB] dark:bg-slate-800" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <ProviderButton label="Google" icon={<Chrome className="h-5 w-5" />} onClick={() => handleSocialDemo("Google")} />
                    <ProviderButton label="GitHub" icon={<Github className="h-5 w-5" />} onClick={() => handleSocialDemo("GitHub")} />
                    <ProviderButton label="Apple" icon={<Zap className="h-5 w-5" />} onClick={() => handleSocialDemo("Apple")} />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 28 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.24 }}
                  className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-6"
                >
                  {step === "profession" && (
                    <div>
                      <h2 className="text-3xl font-black tracking-tight">{t("app.onboarding.professionTitle")}</h2>
                      <p className="mt-2 text-sm text-[#6B7280] dark:text-slate-400">{t("app.onboarding.professionDesc")}</p>
                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {PROFESSIONS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setProfession(item.id)}
                            className={`flex items-center gap-4 rounded-[24px] border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 ${profession === item.id ? "border-indigo-300 bg-indigo-50 ring-4 ring-indigo-100 dark:border-indigo-400/50 dark:bg-indigo-500/10 dark:ring-indigo-500/15" : "border-[#E5E7EB] bg-white hover:border-indigo-200 dark:border-slate-700 dark:bg-slate-900/70"}`}
                          >
                            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300">{item.icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-black">{t(`app.professions.${item.id}`)}</span>
                              <span className="mt-1 block text-xs text-[#6B7280] dark:text-slate-400">{t(`app.onboarding.professionDescriptions.${item.id}`, item.desc)}</span>
                            </span>
                            {profession === item.id && <CheckCircle2 className="h-5 w-5 text-indigo-600" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {step === "goal" && (
                    <div>
                      <h2 className="text-3xl font-black tracking-tight">{t("app.onboarding.goalTitle")}</h2>
                      <p className="mt-2 text-sm text-[#6B7280] dark:text-slate-400">{t("app.onboarding.goalDesc")}</p>
                      <div className="mt-6 grid gap-3">
                        {GOALS.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setGoal(item.id)}
                            className={`flex items-center gap-4 rounded-[24px] border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 ${goal === item.id ? "border-indigo-300 bg-indigo-50 ring-4 ring-indigo-100 dark:border-indigo-400/50 dark:bg-indigo-500/10 dark:ring-indigo-500/15" : "border-[#E5E7EB] bg-white hover:border-indigo-200 dark:border-slate-700 dark:bg-slate-900/70"}`}
                          >
                            <span className="h-3 w-3 rounded-full" style={{ background: item.accent }} />
                            <span className="flex-1 font-black">{t(`app.goals.${item.id}`)}</span>
                            {goal === item.id && <CheckCircle2 className="h-5 w-5 text-indigo-600" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {step === "experience" && (
                    <div>
                      <h2 className="text-3xl font-black tracking-tight">{t("app.onboarding.experienceTitle")}</h2>
                      <p className="mt-2 text-sm text-[#6B7280] dark:text-slate-400">{t("app.onboarding.experienceDesc")}</p>
                      <div className="mt-6 grid gap-3">
                        {EXPERIENCES.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setExperience(item.id)}
                            className={`flex items-center gap-4 rounded-[24px] border p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 ${experience === item.id ? "border-indigo-300 bg-indigo-50 ring-4 ring-indigo-100 dark:border-indigo-400/50 dark:bg-indigo-500/10 dark:ring-indigo-500/15" : "border-[#E5E7EB] bg-white hover:border-indigo-200 dark:border-slate-700 dark:bg-slate-900/70"}`}
                          >
                            <span className="h-3 w-3 rounded-full" style={{ background: item.color }} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-black">{t(`app.experience.${item.id}`)}</span>
                              <span className="mt-1 block text-xs text-[#6B7280] dark:text-slate-400">{t(`app.onboarding.experienceDescriptions.${item.id}`, item.desc)}</span>
                            </span>
                            {experience === item.id && <CheckCircle2 className="h-5 w-5 text-indigo-600" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-8 flex justify-end">
                    <motion.button
                      type="button"
                      onClick={goNextProfile}
                      disabled={!profileReady}
                      whileTap={profileReady ? { scale: 0.98 } : undefined}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 px-6 text-sm font-black text-white shadow-lg shadow-indigo-200 transition-all hover:from-indigo-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-45 dark:shadow-indigo-950/30"
                    >
                      {step === "experience" ? t("app.onboarding.launchWorkspace") : t("app.common.continue")}
                      <ArrowRight className="h-4 w-4" />
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>
    </main>
  );
}
