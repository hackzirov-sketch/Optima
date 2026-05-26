import { motion } from "framer-motion";
import { UserPlus, Settings, Layout } from "lucide-react";
import { useTranslation } from "react-i18next";

const STEP_ICONS = [UserPlus, Settings, Layout];

export function HowItWorksSection() {
  const { t } = useTranslation();
  const steps = t("howItWorks.steps", { returnObjects: true }) as Array<{ title: string; desc: string }>;

  return (
    <section id="how-it-works" className="py-24 bg-background overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-20">
          <motion.h2
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            {t("howItWorks.title")}
          </motion.h2>
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="hidden md:block absolute top-1/2 left-10 right-10 h-0.5 bg-gradient-to-r from-transparent via-border to-transparent -translate-y-1/2 z-0" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative z-10">
            {steps.map((step, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <motion.div
                  key={i}
                  className="flex flex-col items-center text-center bg-card rounded-2xl p-8 shadow-sm border border-border/50 relative group"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.2 }}
                  whileHover={{ y: -4 }}
                >
                  <div className="absolute -top-5 w-10 h-10 rounded-full bg-indigo-500 text-white font-bold flex items-center justify-center shadow-lg border-4 border-background">
                    {i + 1}
                  </div>
                  <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center mb-6 group-hover:bg-indigo-100 transition-colors">
                    <Icon className="w-10 h-10 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-3">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
