'use client';

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle2,
  Code2,
  GraduationCap,
  Megaphone,
  Palette,
  ShieldCheck,
  Video,
} from "lucide-react";

import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Experience, Goal, Profession, UserProfile } from "@/types";
import { storage } from "@/utils/storage";

const ThemeToggle = dynamic(() => import("@/components/ThemeToggle").then(m => m.ThemeToggle), { ssr: false });
const LanguageSwitcher = dynamic(() => import("@/components/landing/LanguageSwitcher").then(m => m.LanguageSwitcher), { ssr: false });

type WizardStep = "profession" | "goal" | "experience";

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

function StepPill({ active, label }: { active: boolean; label: string }) {
  return (
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

export default function OnboardingPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = useState<WizardStep>("profession");
  const [profession, setProfession] = useState<Profession | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);

  const profileSteps: WizardStep[] = ["profession", "goal", "experience"];
  const stepIndex = profileSteps.indexOf(step);

  const profileReady =
    (step === "profession" && !!profession) ||
    (step === "goal" && !!goal) ||
    (step === "experience" && !!experience);

  const saveAndEnter = () => {
    const user = storage.getUser() || { name: "User", joinedAt: Date.now() } as UserProfile;
    storage.saveUser({ ...user, profession: profession!, goal: goal!, experience: experience! });
    storage.setOnboarded();
    router.push("/app/dashboard");
  };

  const goBack = () => {
    const idx = profileSteps.indexOf(step);
    if (idx <= 0) {
      router.push("/");
      return;
    }
    setStep(profileSteps[idx - 1]);
  };

  const goNextProfile = () => {
    if (step === "profession" && profession) setStep("goal");
    if (step === "goal"       && goal)       setStep("experience");
    if (step === "experience" && experience) saveAndEnter();
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-100 px-4 py-6 text-foreground dark:bg-[#08111F] sm:px-6 lg:px-8">
      {/* Background gradients */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(99,102,241,0.14),transparent_32%),radial-gradient(circle_at_90%_14%,rgba(59,130,246,0.10),transparent_30%)] dark:bg-[radial-gradient(circle_at_12%_4%,rgba(99,102,241,0.22),transparent_32%),radial-gradient(circle_at_90%_14%,rgba(59,130,246,0.18),transparent_30%)]" />
      <div className="pointer-events-none absolute -left-20 top-24 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/10" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-500/10" />

      <div className="relative mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-7xl flex-col">
        {/* ── Header ── */}
        <header className="mb-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => router.push("/")} className="group flex min-w-0 items-center gap-3 text-left">
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
        <section className="grid flex-1 overflow-hidden rounded-[34px] border border-slate-200 bg-white/90 shadow-2xl shadow-slate-300/40 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/40 lg:grid-cols-[0.95fr_1.05fr]">
          {/* ── Left panel (desktop only) ── */}
          <aside className="relative hidden overflow-hidden border-r border-slate-200 bg-slate-50 p-8 text-slate-900 dark:border-slate-800 dark:bg-[#0F1929] dark:text-white lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(99,102,241,0.1),transparent_32%),radial-gradient(circle_at_86%_20%,rgba(59,130,246,0.1),transparent_30%),linear-gradient(145deg,#f8fafc,#f1f5f9_55%,#e2e8f0)] dark:bg-[radial-gradient(circle_at_20%_12%,rgba(99,102,241,0.45),transparent_32%),radial-gradient(circle_at_86%_20%,rgba(59,130,246,0.32),transparent_30%),linear-gradient(145deg,#0B1120,#111827_55%,#172033)]" />
            <div className="pointer-events-none absolute inset-0 opacity-10 dark:opacity-30 [background-image:linear-gradient(rgba(0,0,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.1)_1px,transparent_1px)] dark:[background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:44px_44px]" />

            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-black/5 px-3 py-1.5 text-xs font-bold text-indigo-600 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-indigo-200">
                <ShieldCheck className="h-4 w-4" />
                Profile Setup
              </span>
              <h1 className="mt-7 max-w-lg text-4xl font-black tracking-tight xl:text-5xl">
                Personalize your workspace experience.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-slate-600 dark:text-slate-400">
                Let us know a bit about you to tailor the chat, projects, and AI interactions to your needs.
              </p>
            </div>

            <div className="relative grid gap-3">
              {[
                ["Profession",     "Choose your primary focus field."],
                ["Goal",           "Select what you want to achieve."],
                ["Level",          "Provide your current experience."],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-[24px] border border-black/5 bg-black/5 p-4 backdrop-blur-xl dark:border-white/8 dark:bg-white/5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-2xl bg-black/5 text-indigo-600 dark:bg-white/8 dark:text-indigo-300">
                      <Check className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-black text-slate-900 dark:text-white">{title}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{desc}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* ── Right panel (form area) ── */}
          <div className="flex min-h-[720px] flex-col p-4 sm:p-6 lg:p-8">
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
                {["Role", "Goal", "Level"].map((label, i) => (
                  <StepPill key={label} label={label} active={i <= stepIndex} />
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
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

                <div className="mt-8 flex justify-end">
                  <PrimaryButton onClick={goNextProfile} disabled={!profileReady} fullWidth={false}>
                    {step === "experience" ? "Launch workspace" : "Continue"}
                    <ArrowRight className="h-4 w-4" />
                  </PrimaryButton>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </main>
  );
}