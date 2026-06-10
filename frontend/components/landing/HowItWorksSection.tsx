'use client';
import { motion } from "framer-motion";
import { UserPlus, Settings, Layout } from "lucide-react";
import { useTranslation } from "react-i18next";

const STEP_ICONS = [UserPlus, Settings, Layout];

const STEP_GRADIENTS = [
  { icon: 'from-indigo-500 to-blue-500', glow: 'shadow-indigo-500/30', num: 'from-indigo-500 to-blue-600', border: 'group-hover:border-indigo-400/40' },
  { icon: 'from-violet-500 to-purple-500', glow: 'shadow-violet-500/30', num: 'from-violet-500 to-purple-600', border: 'group-hover:border-violet-400/40' },
  { icon: 'from-fuchsia-500 to-pink-500', glow: 'shadow-fuchsia-500/30', num: 'from-fuchsia-500 to-pink-600', border: 'group-hover:border-fuchsia-400/40' },
];

export function HowItWorksSection() {
  const { t } = useTranslation();
  const steps = t("howItWorks.steps", { returnObjects: true }) as Array<{ title: string; desc: string }>;

  return (
    <section id="how-it-works" className="relative py-28 overflow-hidden bg-background">
      {/* Subtle background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-0 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-indigo-500/5 blur-3xl" />
        <div className="absolute right-1/4 bottom-0 h-[400px] w-[400px] translate-x-1/2 rounded-full bg-violet-500/5 blur-3xl" />
      </div>

      <div className="container relative mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-indigo-50 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400 mb-5"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
            {t("howItWorks.badge", "How it works")}
          </motion.div>

          <motion.h2
            className="text-3xl md:text-5xl font-black tracking-tight text-foreground mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            {t("howItWorks.title")}
          </motion.h2>

          <motion.p
            className="text-muted-foreground text-base max-w-md mx-auto"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            {t("howItWorks.subtitle", "Set up your workspace in minutes and start collaborating right away.")}
          </motion.p>
        </div>

        {/* Steps grid */}
        <div className="relative max-w-5xl mx-auto">
          {/* Connector line */}
          <div className="hidden md:block absolute top-16 left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-px z-0">
            <div className="h-full w-full bg-gradient-to-r from-indigo-400/40 via-violet-400/40 to-fuchsia-400/40" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
            {steps.map((step, i) => {
              const Icon = STEP_ICONS[i];
              const g = STEP_GRADIENTS[i];
              return (
                <motion.div
                  key={i}
                  className={`group relative flex flex-col items-center text-center rounded-3xl border border-border/60 bg-card p-8 pt-12 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl ${g.border}`}
                  initial={{ opacity: 0, y: 32 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.15 }}
                >
                  {/* Step number badge */}
                  <div className={`absolute -top-5 h-10 w-10 rounded-2xl bg-gradient-to-br ${g.num} flex items-center justify-center font-black text-white text-base shadow-lg ${g.glow}`}>
                    {i + 1}
                  </div>

                  {/* Icon container */}
                  <div className={`relative mb-6 h-20 w-20 rounded-2xl bg-gradient-to-br ${g.icon} flex items-center justify-center shadow-lg ${g.glow} transition-transform duration-300 group-hover:scale-105`}>
                    <Icon className="h-9 w-9 text-white" />
                    {/* Subtle inner glow */}
                    <div className="absolute inset-0 rounded-2xl bg-white/10" />
                  </div>

                  <h3 className="text-xl font-black text-foreground mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>

                  {/* Hover gradient overlay */}
                  <div className={`pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br ${g.icon} opacity-0 transition-opacity duration-300 group-hover:opacity-[0.04]`} />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
