'use client';

export const dynamic = 'force-dynamic';

import { useState } from "react";
import {
  BadgeCheck,
  Bot,
  Check,
  Crown,
  CreditCard,
  Headphones,
  LayoutGrid,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Video,
  Wallet,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/app/AppLayout";
import { ActionButton, PageHeader, PageShell, Pill, SectionTitle, SurfaceCard, Toast, cn } from "@/components/app/DesignSystem";
import { AutomationRuleCard, WidgetCard } from "@/components/app/PowerWorkspaceSystem";
import { AI_AGENTS, AUTOMATION_RULES, DASHBOARD_WIDGETS, PREMIUM_BENEFITS, PREMIUM_COMPARISON, PREMIUM_PLANS } from "@/data/ecosystemData";
import type { UserProfile } from "@/types";



const BENEFIT_ICONS = {
  ai: Bot,
  workspace: LayoutGrid,
  meetings: Video,
  bank: Wallet,
  community: BadgeCheck,
  support: Headphones,
} as const;

function formatKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}

import { useAuth } from "@/hooks/useAuth";

export default function Page() {
  const { user, logout: onLogout } = useAuth();
  const { t } = useTranslation();
  const [selectedPlan, setSelectedPlan] = useState("pro");

  const [notice, setNotice] = useState<string | null>(null);
  const activePlan = PREMIUM_PLANS.find((plan) => plan.id === selectedPlan) ?? PREMIUM_PLANS[1];

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2000);
  };

  return (
    <AppLayout user={user} title={t("app.nav.premium")} onLogout={onLogout}>
      <PageShell>
        <PageHeader
          eyebrow={t("app.premium.eyebrow")}
          title={t("app.premium.title")}
          description={t("app.premium.description")}
        >
          <ActionButton onClick={() => showNotice(t("app.premium.toasts.checkout"))}>
            <Crown className="h-4 w-4" />
            {t("app.premium.upgrade")}
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => showNotice(t("app.premium.toasts.compare"))}>
            <Sparkles className="h-4 w-4" />
            {t("app.premium.comparePlans")}
          </ActionButton>
        </PageHeader>

        <section className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <SurfaceCard className="relative overflow-hidden bg-[#0B1120] p-0 text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(99,102,241,0.48),transparent_34%),radial-gradient(circle_at_90%_10%,rgba(59,130,246,0.30),transparent_32%)]" />
            <div className="relative p-6 sm:p-7">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <Pill className="bg-white/10 text-indigo-100 ring-white/15" tone="slate">
                    <Crown className="mr-1 h-3.5 w-3.5" />
                    {t("app.premium.currentPlan")}
                  </Pill>
                  <h2 className="mt-5 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
                    {t("app.premium.heroTitle", { name: user?.name })}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">{t("app.premium.heroDesc")}</p>
                </div>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.07] p-4 text-left backdrop-blur-xl md:w-56">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-200">{t("app.premium.selectedPlan")}</p>
                  <div className="mt-3 flex items-end gap-1">
                    <span className="text-4xl font-black">{activePlan.price}</span>
                    <span className="pb-1 text-sm text-slate-400">{t(`app.premium.plans.${activePlan.id}.period`, activePlan.period)}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold">{t(`app.premium.plans.${activePlan.id}.name`, activePlan.name)}</p>
                </div>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: Zap, label: t("app.premium.stats.ai"), value: "10x" },
                  { icon: Users, label: t("app.premium.stats.team"), value: "∞" },
                  { icon: ShieldCheck, label: t("app.premium.stats.support"), value: "24h" },
                ].map((item) => (
                  <div key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
                    <item.icon className="h-5 w-5 text-indigo-200" />
                    <p className="mt-4 text-2xl font-black">{item.value}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Crown} title={t("app.premium.whyTitle")} description={t("app.premium.whyDesc")} />
            <div className="space-y-3">
              {PREMIUM_BENEFITS.slice(0, 4).map((benefit) => {
                const Icon = BENEFIT_ICONS[benefit.id as keyof typeof BENEFIT_ICONS] ?? Star;
                return (
                  <div key={benefit.id} className="flex items-start gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                    <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-white shadow-sm" style={{ color: benefit.accent }}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-[#111827]">{t(`app.premium.benefits.${benefit.id}.title`, benefit.title)}</p>
                        <span className="hidden rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#6B7280] ring-1 ring-[#E5E7EB] sm:inline-flex">
                          {t(`app.premium.benefits.${benefit.id}.metric`, benefit.metric)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-[#6B7280]">{t(`app.premium.benefits.${benefit.id}.description`, benefit.description)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </SurfaceCard>
        </section>

        <SurfaceCard>
          <SectionTitle
            icon={Zap}
            title={t("app.premium.productivityTitle", "Premium productivity engine")}
            description={t("app.premium.productivityDesc", "Advanced dashboards, Flow Automations, AI agents, workspace packs, longer meetings, premium reactions, and team admin tools in one scalable layer.")}
          />
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-3 md:grid-cols-2">
              {DASHBOARD_WIDGETS.slice(0, 4).map((widget) => (
                <WidgetCard key={widget.id} widget={widget} />
              ))}
            </div>
            <div className="space-y-3">
              <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-500">AI agent bundle</p>
                    <h3 className="mt-2 font-black text-[#111827]">{AI_AGENTS.length} premium agents ready</h3>
                  </div>
                  <Pill tone="indigo">Pro</Pill>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {AI_AGENTS.slice(0, 4).map((agent) => (
                    <Pill key={agent.id} tone="blue">{agent.title}</Pill>
                  ))}
                </div>
              </div>
              {AUTOMATION_RULES.slice(0, 2).map((rule) => (
                <AutomationRuleCard key={rule.id} rule={rule} />
              ))}
              <div className="grid gap-2 sm:grid-cols-2">
                {["Longer meetings", "Team admin tools", "Workspace packs", "Premium reactions"].map((benefit) => (
                  <div key={benefit} className="rounded-2xl bg-white p-3 text-sm font-black text-[#111827] ring-1 ring-[#E5E7EB]">
                    {benefit}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>

        <section className="grid gap-4 lg:grid-cols-3">
          {PREMIUM_PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlan(plan.id)}
              className={cn(
                "relative overflow-hidden rounded-[30px] border bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg",
                plan.featured ? "border-indigo-200 ring-4 ring-indigo-100" : "border-[#E5E7EB]",
                selectedPlan === plan.id && "border-indigo-300",
              )}
            >
              {plan.featured && <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 to-blue-500" />}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Pill tone={plan.featured ? "indigo" : "slate"}>{t(`app.premium.plans.${plan.id}.badge`, plan.badge)}</Pill>
                  <h3 className="mt-4 text-xl font-black text-[#111827]">{t(`app.premium.plans.${plan.id}.name`, plan.name)}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6B7280]">{t(`app.premium.plans.${plan.id}.description`, plan.description)}</p>
                </div>
                {selectedPlan === plan.id && <Check className="h-5 w-5 text-indigo-600" />}
              </div>
              <div className="mt-5 flex items-end gap-1">
                <span className="text-4xl font-black text-[#111827]">{plan.price}</span>
                <span className="pb-1 text-sm font-semibold text-[#6B7280]">{t(`app.premium.plans.${plan.id}.period`, plan.period)}</span>
              </div>
              <div className="mt-5 space-y-2">
                {plan.features.map((feature, index) => (
                  <div key={feature} className="flex items-center gap-2 text-sm text-[#111827]">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {t(`app.premium.plans.${plan.id}.features.${index}`, feature)}
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <span className={cn("inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-black", plan.featured ? "bg-indigo-600 text-white" : "bg-[#F7FAFC] text-[#111827] ring-1 ring-[#E5E7EB]")}>
                  {t(`app.premium.plans.${plan.id}.cta`, plan.cta)}
                </span>
              </div>
            </button>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
          <SurfaceCard>
            <SectionTitle icon={CreditCard} title={t("app.premium.checkoutTitle")} description={t("app.premium.checkoutDesc")} />
            <div className="rounded-[26px] border border-[#E5E7EB] bg-[#F7FAFC] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#111827]">{t(`app.premium.plans.${activePlan.id}.name`, activePlan.name)}</p>
                  <p className="mt-1 text-xs text-[#6B7280]">{t("app.premium.localOnly")}</p>
                </div>
                <Pill tone={activePlan.featured ? "indigo" : "slate"}>{activePlan.price}</Pill>
              </div>
              <ActionButton className="mt-4 w-full" onClick={() => showNotice(t("app.premium.toasts.checkout"))}>
                <CreditCard className="h-4 w-4" />
                {t("app.premium.mockCheckout")}
              </ActionButton>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-[#6B7280]">
              <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /> {t("app.premium.checkoutNotes.secure")}</p>
              <p className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-indigo-500" /> {t("app.premium.checkoutNotes.demo")}</p>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle icon={Sparkles} title={t("app.premium.comparisonTitle")} description={t("app.premium.comparisonDesc")} />
            <div className="overflow-hidden rounded-2xl border border-[#E5E7EB]">
              <div className="grid grid-cols-[1fr_0.8fr_0.8fr_1fr] gap-3 bg-[#F7FAFC] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#6B7280] max-md:hidden">
                <span>{t("app.premium.table.feature")}</span>
                <span>{t("app.premium.table.free")}</span>
                <span>{t("app.premium.table.pro")}</span>
                <span>{t("app.premium.table.team")}</span>
              </div>
              <div className="divide-y divide-[#E5E7EB] bg-white">
                {PREMIUM_COMPARISON.map((row) => (
                  <div key={row.feature} className="grid gap-2 px-4 py-4 text-sm md:grid-cols-[1fr_0.8fr_0.8fr_1fr]">
                    <p className="font-black text-[#111827]">{t(`app.premium.comparison.${formatKey(row.feature)}.feature`, row.feature)}</p>
                    <p className="text-[#6B7280]">{t(`app.premium.comparison.${formatKey(row.feature)}.free`, row.free)}</p>
                    <p className="font-bold text-indigo-600">{t(`app.premium.comparison.${formatKey(row.feature)}.pro`, row.pro)}</p>
                    <p className="text-[#111827]">{t(`app.premium.comparison.${formatKey(row.feature)}.team`, row.team)}</p>
                  </div>
                ))}
              </div>
            </div>
          </SurfaceCard>
        </section>
      </PageShell>
      <Toast message={notice} />
    </AppLayout>
  );
}
