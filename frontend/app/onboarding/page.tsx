'use client';

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
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/landing/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Experience, Goal, Profession, UserProfile } from "@/types";
import { storage } from "@/utils/storage";

type AuthMode = "signin" | "signup";
type LoginMethod = "email" | "phone";
type WizardStep = "auth" | "profession" | "goal" | "experience";

const PROFESSIONS: { id: Profession; icon: ReactNode; desc: string }[] = [
  { id: "developer",  icon: <Code2 className="h-5 w-5" />,        desc: "Software, products, systems"  },
  { id: "teacher",    icon: <GraduationCap className="h-5 w-5" />, desc: "Courses, students, lessons"   },
  { id: "student",    icon: <BookOpen className="h-5 w-5" />,      desc: "Learning, notes, growth"      },
  { id: "freelancer", icon: <Briefcase className="h-5 w-5" />,     desc: "Clients, income, delivery"    },
  { id: "designer",   icon: <Palette className="h-5 w-5" />,       desc: "UI, brand, creative work"     },
  { id: "smm",        icon: <Megaphone className="h-5 w-5" />,     desc: "Content, campaigns, reach"    },
  { id: "creator",    icon: <Video className="h-5 w-5" />,         desc: "Media, audience, publishing"  },
];

const GOALS: { id: Goal; accent: string }[] = [
  { id: "learn",            accent: "#10B981" },
  { id: "find_work",        accent: "#3B82F6" },
  { id: "manage_team",      accent: "#6366F1" },
  { id: "build_portfolio",  accent: "#F59E0B" },
  { id: "freelance",        accent: "#EF4444" },
];

const EXPERIENCES: { id: Experience; desc: string; color: string }[] = [
  { id: "beginner",     desc: "Just getting started",         color: "#10B981" },
  { id: "intermediate", desc: "Already building momentum",    color: "#3B82F6" },
  { id: "advanced",     desc: "Ready for serious systems",    color: "#8B5CF6" },
];

function createDemoProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: "Ahmad",
    profession: "student",
    goal: "find_work",
    experience: "intermediate",
    joinedAt: Date.now(),
    ...overrides,
  };
}

// ─── AuthField ────────────────────────────────────────────────────────────────
function AuthField({
  icon, label, value, onChange, placeholder, type = "text", autoComplete, action,
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
      {/* ✅ TO'G'RI: faqat bitta dark: variant */}
      <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </span>
      <span className="flex h-12 items-center gap-3 rounded-2xl border border-border bg-muted px-4 shadow-sm transition-all
        group-focus-within:border-indigo-400 group-focus-within:bg-card group-focus-within:ring-4 group-focus-within:ring-indigo-100
        dark:bg-slate-900 dark:border-slate-700
        dark:group-focus-within:border-indigo-400 dark:group-focus-within:bg-slate-950 dark:group-focus-within:ring-indigo-500/20">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none
            placeholder:text-slate-400 dark:placeholder:text-slate-600"
        />
        {action}
      </span>
    </label>
  );
}

// ─── ProviderButton ───────────────────────────────────────────────────────────
function ProviderButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[5rem] flex-col items-center justify-center gap-2 rounded-[22px] border border-border bg-card p-3
        text-xs font-bold text-slate-500 shadow-sm transition-all
        hover:-translate-y-0.5 hover:border-indigo-300 hover:text-foreground hover:shadow-md
        dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400
        dark:hover:border-indigo-500 dark:hover:text-white"
    >
      {/* ✅ icon rangini alohida boshqarish */}
      <span className="text-foreground dark:text-slate-200">{icon}</span>
      {label}
    </button>
  );
}

// ─── StepPill ─────────────────────────────────────────────────────────────────
function StepPill({ active, label }: { active: boolean; label: string }) {
  return (
    // ✅ TO'G'RI: bitta dark: variant, duplicate yo'q
    <span className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
      <span className={`h-2.5 w-2.5 rounded-full transition-colors ${
        active
          ? "bg-indigo-500"
          : "bg-slate-200 dark:bg-slate-700"
      }`} />
      {label}
    </span>
  );
}

// ─── EyeToggle ───────────────────────────────────────────────────────────────
function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-slate-400 transition-colors hover:text-foreground dark:hover:text-slate-200"
      aria-label="Toggle password visibility"
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

// ─── TabToggle ────────────────────────────────────────────────────────────────
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[18px] px-4 py-3 text-sm font-black transition-all ${
        active
          ? "bg-card text-foreground shadow-sm dark:bg-slate-800 dark:text-white"
          : "text-slate-500 hover:text-foreground dark:text-slate-400 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

// ─── PrimaryButton ────────────────────────────────────────────────────────────
function PrimaryButton({
  onClick, disabled, children, fullWidth = true,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl
        bg-gradient-to-r from-indigo-500 to-blue-500 px-6
        text-sm font-black text-white shadow-lg shadow-indigo-200/60
        transition-all hover:from-indigo-600 hover:to-blue-600
        disabled:cursor-not-allowed disabled:opacity-40
        dark:shadow-indigo-950/40
        ${fullWidth ? "w-full" : ""}`}
    >
      {children}
    </motion.button>
  );
}

// ─── SelectCard ──────────────────────────────────────────────────────────────
function SelectCard({
  selected, onClick, children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-4 rounded-[24px] border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 ${
        selected
          ? "border-indigo-400 bg-indigo-50 ring-4 ring-indigo-100 dark:border-indigo-500 dark:bg-indigo-500/10 dark:ring-indigo-500/20"
          : "border-border bg-card hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900/80 dark:hover:border-indigo-600"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = (path: string) => router.push(path);

  const initialMode: AuthMode =
    typeof window !== "undefined" && window.location.search.includes("mode=signin")
      ? "signin"
      : "signup";

  const [authMode, setAuthMode]               = useState<AuthMode>(initialMode);
  const [loginMethod, setLoginMethod]         = useState<LoginMethod>("email");
  const [step, setStep]                       = useState<WizardStep>("auth");
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);

  // Sign-in fields
  const [signinId, setSigninId]               = useState("");
  const [signinPw, setSigninPw]               = useState("");

  // Sign-up fields
  const [fullName, setFullName]               = useState("");
  const [email, setEmail]                     = useState("");
  const [phone, setPhone]                     = useState("");
  const [username, setUsername]               = useState("");
  const [password, setPassword]               = useState("");
  const [confirmPw, setConfirmPw]             = useState("");
  const [acceptedTerms, setAcceptedTerms]     = useState(false);

  // Wizard
  const [profession, setProfession]           = useState<Profession | null>(null);
  const [goal, setGoal]                       = useState<Goal | null>(null);
  const [experience, setExperience]           = useState<Experience | null>(null);

  const profileSteps: WizardStep[] = ["profession", "goal", "experience"];
  const stepIndex = step === "auth" ? 0 : profileSteps.indexOf(step) + 1;

  const passwordMismatch = confirmPw.length > 0 && password !== confirmPw;
  const signupReady =
    fullName.trim().length > 1 &&
    email.includes("@") &&
    phone.trim().length >= 7 &&
    username.trim().length > 2 &&
    password.length >= 6 &&
    password === confirmPw &&
    acceptedTerms;
  const signinReady  = signinId.trim().length > 3 && signinPw.length >= 4;
  const profileReady =
    (step === "profession" && !!profession) ||
    (step === "goal" && !!goal) ||
    (step === "experience" && !!experience);

  const primaryName = useMemo(() => {
    if (fullName.trim()) return fullName.trim();
    if (signinId.includes("@")) return signinId.split("@")[0] || "User";
    return "Ahmad";
  }, [fullName, signinId]);

  const saveAndEnter = (profile: Partial<UserProfile> = {}) => {
    storage.saveUser(createDemoProfile(profile));
    storage.setOnboarded();
    navigate("/app/home");
  };

  const handleSignin = () => {
    if (!signinReady) return;
    const existing = storage.getUser();
    saveAndEnter({
      ...existing,
      name: existing?.name ?? primaryName,
      email: loginMethod === "email" ? signinId : existing?.email,
      phone: loginMethod === "phone" ? signinId : existing?.phone,
    });
  };

  const handleSocialDemo = (provider: string) =>
    saveAndEnter({ name: storage.getUser()?.name ?? `${provider} User`, authProvider: provider.toLowerCase() });

  const handleCreateAccount = () => { if (signupReady) setStep("profession"); };

  const handleFinish = () => {
    if (!profession || !goal || !experience) return;
    saveAndEnter({ name: fullName.trim() || "User", profession, goal, experience, email, phone, username, joinedAt: Date.now() });
  };

  const goBack = () => {
    if (step === "auth") { navigate("/"); return; }
    const idx = profileSteps.indexOf(step);
    setStep(idx <= 0 ? "auth" : profileSteps[idx - 1]);
  };

  const goNextProfile = () => {
    if (step === "profession" && profession) setStep("goal");
    if (step === "goal"       && goal)       setStep("experience");
    if (step === "experience" && experience) handleFinish();
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-100 px-4 py-6 text-foreground dark:bg-[#08111F] sm:px-6 lg:px-8">

      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0
        bg-[radial-gradient(circle_at_12%_4%,rgba(99,102,241,0.14),transparent_32%),radial-gradient(circle_at_90%_14%,rgba(59,130,246,0.10),transparent_30%)]
        dark:bg-[radial-gradient(circle_at_12%_4%,rgba(99,102,241,0.22),transparent_32%),radial-gradient(circle_at_90%_14%,rgba(59,130,246,0.18),transparent_30%)]" />
      <div className="pointer-events-none absolute -left-20 top-24 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/10" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-500/10" />

      <div className="relative mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-7xl flex-col">

        {/* ── Header ── */}
        <header className="mb-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate("/")} className="group flex min-w-0 items-center gap-3 text-left">
            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-sm font-black text-white shadow-lg shadow-indigo-200/60 transition-transform group-hover:scale-105 dark:shadow-indigo-950/30">
              U
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-black tracking-tight">UPZ</span>
              <span className="hidden truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:block">
                Universal Productivity Zone
              </span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <LanguageSwitcher />
          </div>
        </header>

        {/* ── Main card ── */}
        <section className="grid flex-1 overflow-hidden rounded-[34px] border border-slate-200 bg-white/90 shadow-2xl shadow-slate-300/40 backdrop-blur-xl
          dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/40
          lg:grid-cols-[0.95fr_1.05fr]">

          {/* ── Left panel (desktop only) ── */}
          <aside className="relative hidden overflow-hidden border-r border-slate-200 bg-[#0F1929] p-8 text-white dark:border-slate-800 lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(99,102,241,0.45),transparent_32%),radial-gradient(circle_at_86%_20%,rgba(59,130,246,0.32),transparent_30%),linear-gradient(145deg,#0B1120,#111827_55%,#172033)]" />
            <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:44px_44px]" />

            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-indigo-200 backdrop-blur">
                <ShieldCheck className="h-4 w-4" />
                Secure MVP access
              </span>
              <h1 className="mt-7 max-w-lg text-4xl font-black tracking-tight xl:text-5xl">
                One calm account for your whole productivity zone.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-slate-400">
                Sign in with email or phone, create a richer profile, then enter your UPZ workspace with chat, meetings, projects, bank, news, community, and AI.
              </p>
            </div>

            <div className="relative grid gap-3">
              {[
                ["Multi-entry login",     "Email or phone sign-in for the MVP demo."],
                ["Complete registration", "Full name, email, phone, username, and password."],
                ["Workspace ready",       "Profile setup continues after account creation."],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-[24px] border border-white/8 bg-white/5 p-4 backdrop-blur-xl">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-2xl bg-white/8 text-indigo-300">
                      <Check className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-black text-white">{title}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-400">{desc}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* ── Right panel (form area) ── */}
          <div className="flex min-h-[720px] flex-col p-4 sm:p-6 lg:p-8">

            {/* Step pills bar */}
            <div className="mb-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm font-bold
                  text-slate-500 shadow-sm transition-all
                  hover:-translate-y-0.5 hover:text-foreground
                  dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <div className="hidden items-center gap-3 sm:flex">
                {["Account", "Role", "Goal", "Level"].map((label, i) => (
                  <StepPill key={label} label={label} active={i <= stepIndex} />
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">

              {/* ────────── AUTH STEP ────────── */}
              {step === "auth" && (
                <motion.div
                  key="auth"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.22 }}
                  className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-4"
                >
                  {/* Heading */}
                  <div className="mb-7 text-center sm:text-left">
                    <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
                      <Sparkles className="h-4 w-4" />
                      UPZ account
                    </span>
                    <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                      {authMode === "signup" ? "Create your productivity account" : "Welcome back to UPZ"}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      {authMode === "signup"
                        ? "Register with both email and phone so future backend login, verification, and team invites are ready."
                        : "Choose email or phone, enter your password, and continue into the local MVP workspace."}
                    </p>
                  </div>

                  {/* Sign in / Create account tabs */}
                  <div className="mb-5 grid grid-cols-2 rounded-[22px] border border-border bg-muted p-1 dark:border-slate-700/60 dark:bg-slate-900">
                    <TabButton active={authMode === "signin"} onClick={() => setAuthMode("signin")}>Sign in</TabButton>
                    <TabButton active={authMode === "signup"} onClick={() => setAuthMode("signup")}>Create account</TabButton>
                  </div>

                  {/* ── Sign-in form ── */}
                  {authMode === "signin" ? (
                    <div className="space-y-4">
                      {/* Email / Phone toggle */}
                      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1 dark:bg-slate-900">
                        {(["email", "phone"] as LoginMethod[]).map((method) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setLoginMethod(method)}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${
                              loginMethod === method
                                ? "bg-card text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300"
                                : "text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {method === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                            {method === "email" ? "Email" : "Phone"}
                          </button>
                        ))}
                      </div>

                      <AuthField
                        icon={loginMethod === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                        label={loginMethod === "email" ? "Email address" : "Phone number"}
                        value={signinId}
                        onChange={setSigninId}
                        placeholder={loginMethod === "email" ? "you@example.com" : "+998 90 123 45 67"}
                        type={loginMethod === "email" ? "email" : "tel"}
                        autoComplete={loginMethod === "email" ? "email" : "tel"}
                      />
                      <AuthField
                        icon={<Lock className="h-4 w-4" />}
                        label="Password"
                        value={signinPw}
                        onChange={setSigninPw}
                        placeholder="Enter your password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        action={<EyeToggle show={showPassword} onToggle={() => setShowPassword(v => !v)} />}
                      />

                      <div className="flex justify-end">
                        <button type="button" className="text-sm font-black text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
                          Forgot password?
                        </button>
                      </div>

                      <PrimaryButton onClick={handleSignin} disabled={!signinReady}>
                        Sign in <ArrowRight className="h-4 w-4" />
                      </PrimaryButton>
                    </div>

                  ) : (
                    /* ── Sign-up form ── */
                    <div className="space-y-4">
                      <AuthField icon={<User className="h-4 w-4" />}  label="Full name" value={fullName} onChange={setFullName} placeholder="Jasur Karimov" autoComplete="name" />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <AuthField icon={<Mail className="h-4 w-4" />}  label="Email" value={email}    onChange={setEmail}    placeholder="your@email.com"       type="email" autoComplete="email" />
                        <AuthField icon={<Phone className="h-4 w-4" />} label="Phone" value={phone}    onChange={setPhone}    placeholder="+998 90 123 45 67"    type="tel"   autoComplete="tel" />
                      </div>

                      <AuthField icon={<AtSign className="h-4 w-4" />} label="Username" value={username} onChange={setUsername} placeholder="@jasur_karimov" autoComplete="username" />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <AuthField
                          icon={<Lock className="h-4 w-4" />}
                          label="Password"
                          value={password}
                          onChange={setPassword}
                          placeholder="Create a strong password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          action={<EyeToggle show={showPassword} onToggle={() => setShowPassword(v => !v)} />}
                        />
                        <AuthField
                          icon={<Lock className="h-4 w-4" />}
                          label="Confirm password"
                          value={confirmPw}
                          onChange={setConfirmPw}
                          placeholder="Repeat your password"
                          type={showConfirm ? "text" : "password"}
                          autoComplete="new-password"
                          action={<EyeToggle show={showConfirm} onToggle={() => setShowConfirm(v => !v)} />}
                        />
                      </div>

                      {passwordMismatch && (
                        <p className="text-sm font-bold text-rose-500 dark:text-rose-400">
                          Passwords do not match yet.
                        </p>
                      )}

                      {/* Terms checkbox */}
                      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-muted p-3 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        <button
                          type="button"
                          onClick={() => setAcceptedTerms(v => !v)}
                          className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-lg border transition-all ${
                            acceptedTerms
                              ? "border-indigo-500 bg-indigo-500 text-white"
                              : "border-slate-300 bg-card dark:border-slate-600 dark:bg-slate-800"
                          }`}
                          aria-label="Accept terms"
                        >
                          {acceptedTerms && <Check className="h-3.5 w-3.5" />}
                        </button>
                        <span>
                          I agree to the{" "}
                          <span className="font-black text-indigo-600 dark:text-indigo-400">Terms of Service</span>
                          {" "}and{" "}
                          <span className="font-black text-indigo-600 dark:text-indigo-400">Privacy Policy</span>.
                        </span>
                      </label>

                      <PrimaryButton onClick={handleCreateAccount} disabled={!signupReady}>
                        Create account <ArrowRight className="h-4 w-4" />
                      </PrimaryButton>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="my-6 flex items-center gap-3 text-xs font-bold text-slate-400 dark:text-slate-600">
                    <span className="h-px flex-1 bg-border dark:bg-slate-800" />
                    {authMode === "signup" ? "or sign up with" : "or continue with"}
                    <span className="h-px flex-1 bg-border dark:bg-slate-800" />
                  </div>

                  {/* Social buttons */}
                  <div className="grid grid-cols-3 gap-3">
                    <ProviderButton label="Google" icon={<Chrome className="h-5 w-5" />} onClick={() => handleSocialDemo("Google")} />
                    <ProviderButton label="GitHub" icon={<Github className="h-5 w-5" />} onClick={() => handleSocialDemo("GitHub")} />
                    <ProviderButton label="Apple"  icon={<Zap className="h-5 w-5" />}    onClick={() => handleSocialDemo("Apple")} />
                  </div>
                </motion.div>
              )}

              {/* ────────── PROFILE WIZARD STEPS ────────── */}
              {step !== "auth" && (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 28 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.24 }}
                  className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-6"
                >

                  {/* ── Profession step ── */}
                  {step === "profession" && (
                    <div>
                      <h2 className="text-3xl font-black tracking-tight">What best describes you?</h2>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        We will tailor your UPZ workspace to your field.
                      </p>
                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        {PROFESSIONS.map((item) => (
                          <SelectCard key={item.id} selected={profession === item.id} onClick={() => setProfession(item.id)}>
                            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-muted text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400">
                              {item.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-black">{t(`app.professions.${item.id}`)}</span>
                              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{item.desc}</span>
                            </span>
                            {profession === item.id && <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />}
                          </SelectCard>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Goal step ── */}
                  {step === "goal" && (
                    <div>
                      <h2 className="text-3xl font-black tracking-tight">What is your main goal?</h2>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        This helps us recommend the right tools first.
                      </p>
                      <div className="mt-6 grid gap-3">
                        {GOALS.map((item) => (
                          <SelectCard key={item.id} selected={goal === item.id} onClick={() => setGoal(item.id)}>
                            <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: item.accent }} />
                            <span className="flex-1 font-black">{t(`app.goals.${item.id}`)}</span>
                            {goal === item.id && <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />}
                          </SelectCard>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Experience step ── */}
                  {step === "experience" && (
                    <div>
                      <h2 className="text-3xl font-black tracking-tight">Your experience level?</h2>
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        No judgment. This only calibrates the workspace suggestions.
                      </p>
                      <div className="mt-6 grid gap-3">
                        {EXPERIENCES.map((item) => (
                          <SelectCard key={item.id} selected={experience === item.id} onClick={() => setExperience(item.id)}>
                            <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: item.color }} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-black">{t(`app.experience.${item.id}`)}</span>
                              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{item.desc}</span>
                            </span>
                            {experience === item.id && <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />}
                          </SelectCard>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Continue / Launch button */}
                  <div className="mt-8 flex justify-end">
                    <PrimaryButton onClick={goNextProfile} disabled={!profileReady} fullWidth={false}>
                      {step === "experience" ? "Launch workspace" : "Continue"}
                      <ArrowRight className="h-4 w-4" />
                    </PrimaryButton>
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