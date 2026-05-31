import { motion } from "framer-motion";
import { Edit3, Award, Target, BookOpen, Briefcase, Star, GitBranch, Code2, Crown, ArrowRight, BadgeCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { AppLayout } from "@/components/app/AppLayout";
import { PremiumGradientBadge, PremiumStatusBadge } from "@/components/premium/PremiumAssets";
import type { UserProfile } from "@/types";

interface Props { user: UserProfile; onLogout: () => void; }

const SKILLS_BY_PROFESSION: Record<string, string[]> = {
  developer: ["JavaScript", "TypeScript", "React", "Node.js", "Git", "REST APIs"],
  designer: ["Figma", "UI/UX", "Prototyping", "Design Systems", "Adobe XD", "Motion Design"],
  teacher: ["Curriculum Design", "E-Learning", "Mentoring", "Public Speaking", "LMS Tools"],
  student: ["Research", "Note-taking", "Time Management", "Critical Thinking", "Collaboration"],
  freelancer: ["Project Management", "Client Communication", "Proposals", "Invoicing", "Portfolio"],
  smm: ["Content Strategy", "SEO", "Analytics", "Copywriting", "Social Platforms", "A/B Testing"],
  creator: ["Video Production", "Editing", "Scripting", "Thumbnail Design", "YouTube SEO", "Instagram"],
};

const MOCK_CERTS = [
  { title: "React Developer Certification", issuer: "Meta", date: "Jan 2024", color: "#61DAFB" },
  { title: "TypeScript Professional", issuer: "Microsoft", date: "Mar 2024", color: "#3178C6" },
];

const MOCK_REPOS = [
  { name: "upz-frontend", lang: "TypeScript", stars: 4, updated: "2d ago", color: "#3178C6" },
  { name: "api-server", lang: "Node.js", stars: 2, updated: "5d ago", color: "#68A063" },
  { name: "design-system", lang: "CSS", stars: 1, updated: "1w ago", color: "#264DE4" },
];

export default function ProfilePage({ user, onLogout }: Props) {
  const { t, i18n } = useTranslation();
  const daysSince = Math.floor((Date.now() - user.joinedAt) / 86400000);
  const skills = SKILLS_BY_PROFESSION[user.profession] ?? SKILLS_BY_PROFESSION.student;
  const profession = t(`app.professions.${user.profession}`, user.profession);
  const goal = t(`app.goals.${user.goal}`, user.goal);
  const experience = t(`app.experience.${user.experience}`, user.experience);
  const joinedLabel = daysSince === 0 ? t("app.profile.joinedToday") : t("app.profile.joinedDays", { count: daysSince });
  const isPremium = Boolean(user.isPremium);

  return (
    <AppLayout user={user} title={t("app.nav.profile")} onLogout={onLogout}>
      <div className="mx-auto max-w-3xl space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl p-6 shadow-sm bg-gradient-to-br from-white to-indigo-50 border border-gray-200 dark:from-gray-800 dark:to-gray-900 dark:border-gray-700"
        >
          <div className="absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/2 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="relative z-10 flex items-start gap-5">
            <div className="h-20 w-20 flex-shrink-0 rounded-[24px] p-[3px]">
              <div className="relative flex h-full w-full items-center justify-center rounded-[21px] text-3xl font-bold text-white" style={{ background: "linear-gradient(135deg, #6366F1, #3B82F6)" }}>
                {user.name.slice(0, 2).toUpperCase()}
                {isPremium && <PremiumStatusBadge status="available" size={24} className="absolute -bottom-2 -right-2 border-indigo-100" />}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-[#111827]">{user.name}</h2>
                    {isPremium && <BadgeCheck className="h-5 w-5 text-blue-500" aria-label="Verified premium profile" />}
                    {isPremium && <PremiumGradientBadge />}
                  </div>
                  <p className="mt-0.5 text-sm text-indigo-600">{profession}</p>
                </div>
                <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-white hover:text-indigo-600">
                  <Edit3 className="h-3.5 w-3.5" /> {t("app.profile.edit")}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "rgba(99,102,241,0.12)", color: "#4F46E5" }}>
                  <Target className="mr-1 inline h-3 w-3" />{goal}
                </span>
                <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "rgba(16,185,129,0.12)", color: "#047857" }}>
                  <BookOpen className="mr-1 inline h-3 w-3" />{experience}
                </span>
                <span className="rounded-full px-2.5 py-1 text-xs font-medium text-[#6B7280]" style={{ background: "#FFFFFF" }}>
                  {joinedLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-5 grid grid-cols-3 gap-4 border-t pt-5" style={{ borderColor: "#E5E7EB" }}>
            {[
              { label: t("app.profile.stats.tasksDone"), value: "24" },
              { label: t("app.profile.stats.projects"), value: "4" },
              { label: t("app.profile.stats.streak"), value: "7" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-xl font-bold text-[#111827]">{stat.value}</div>
                <div className="mt-0.5 text-xs text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-blue-50 p-5 shadow-sm dark:border-indigo-900 dark:from-indigo-950/50 dark:via-gray-800 dark:to-blue-950/50">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
                <Crown className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-black text-gray-900 dark:text-gray-100">{isPremium ? t("app.premium.currentPlan") : t("app.profile.freePlan")}</p>
                <p className="mt-1 max-w-lg text-sm leading-6 text-gray-500 dark:text-gray-400">{isPremium ? t("app.premium.heroDesc") : t("app.profile.freePlanDesc")}</p>
              </div>
            </div>
            {!isPremium && (
              <Link href="/app/premium" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-sm shadow-indigo-200 transition-colors hover:bg-indigo-500">
                {t("app.premium.upgrade")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl p-5 bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100"><Star className="h-4 w-4 text-yellow-400" /> {t("app.profile.skills")}</h3>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span key={skill} className="rounded-full px-3 py-1.5 text-xs font-medium bg-indigo-100/80 text-indigo-700 border border-indigo-200/60 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700/50">{skill}</span>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-xl p-5 bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100"><Briefcase className="h-4 w-4 text-blue-500" /> {t("app.profile.about")}</h3>
            <div className="space-y-3">
              {[
                { label: t("app.profile.profession"), value: profession },
                { label: t("app.profile.mainGoal"), value: goal },
                { label: t("app.profile.experience"), value: experience },
                { label: t("app.profile.memberSince"), value: new Date(user.joinedAt).toLocaleDateString(i18n.language, { month: "long", day: "numeric", year: "numeric" }) },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{row.label}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl p-5 bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100"><Award className="h-4 w-4 text-yellow-400" /> {t("app.profile.certificates")}</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {MOCK_CERTS.map((cert) => (
              <div key={cert.title} className="flex items-center gap-3 rounded-lg p-3 bg-gray-50 border border-gray-200 dark:bg-gray-700/50 dark:border-gray-600">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: `${cert.color}22` }}>
                  <Award className="h-5 w-5" style={{ color: cert.color }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{cert.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{cert.issuer} - {cert.date}</p>
                </div>
              </div>
            ))}
            <div className="flex cursor-pointer items-center justify-center gap-2 rounded-lg p-3 border border-dashed border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400">
              <span className="text-xs">+ {t("app.profile.addCertificate")}</span>
            </div>
          </div>
        </motion.div>

        {user.profession === "developer" && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="rounded-xl p-5 bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100"><GitBranch className="h-4 w-4 text-gray-500 dark:text-gray-400" /> {t("app.profile.githubRepos")}</h3>
            <div className="space-y-3">
              {MOCK_REPOS.map((repo) => (
                <div key={repo.name} className="flex items-center justify-between rounded-lg p-3 bg-gray-50 border border-gray-200 dark:bg-gray-700/50 dark:border-gray-600">
                  <div className="flex items-center gap-3">
                    <Code2 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{repo.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t("app.profile.updated", { time: repo.updated })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full" style={{ background: repo.color }} />
                      <span className="text-xs text-gray-500 dark:text-gray-400">{repo.lang}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400"><Star className="h-3 w-3" /><span className="text-xs">{repo.stars}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}
