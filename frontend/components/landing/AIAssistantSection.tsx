import { motion } from "framer-motion";
import { Sparkles, Brain, Clock, FileText, Lightbulb, Users } from "lucide-react";
import { LottieAnimation } from "./LottieAnimation";
import { useTranslation } from "react-i18next";

const AI_ICONS = [Sparkles, Brain, Clock, FileText, Lightbulb, Users];

export function AIAssistantSection() {
  const { t } = useTranslation();
  const features = t("ai.features", { returnObjects: true }) as string[];

  return (
    <section id="ai-assistant" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <motion.div
            className="flex-1 text-white"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-5xl font-bold mb-6 leading-tight">{t("ai.title")}</h2>
            <p className="text-lg md:text-xl text-indigo-200 mb-10 max-w-xl">{t("ai.subtitle")}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {features.map((feature, i) => {
                const Icon = AI_ICONS[i] ?? Sparkles;
                return (
                  <motion.div
                    key={i}
                    className="flex items-center gap-4"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.1 }}
                  >
                    <div className="w-11 h-11 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <span className="font-medium text-indigo-50 text-base">{feature}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Animation — large, no clipping, natural rendering */}
          <motion.div
            className="flex-1 w-full flex justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div
              className="relative w-full max-w-md rounded-3xl bg-indigo-950/60 border border-indigo-500/20 shadow-2xl backdrop-blur-sm overflow-hidden flex items-center justify-center"
              style={{ height: "380px" }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.18),transparent_70%)] pointer-events-none" />
              <LottieAnimation
                url="/animations/learning.json"
                fallback={
                  <div className="flex flex-col items-center gap-3 text-indigo-400">
                    <Brain className="w-20 h-20 opacity-60" />
                    <span className="text-sm text-indigo-300">Animation loading</span>
                  </div>
                }
                className="w-full h-full p-6 z-10"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
