import { motion } from "framer-motion";
import { Layers, MessageSquare, BarChart3, CheckSquare, BookOpen, Briefcase, Bot, Users, Wallet } from "lucide-react";
import { LottieAnimation } from "./LottieAnimation";
import { useTranslation } from "react-i18next";

const MODULE_ICONS = [Layers, MessageSquare, BarChart3, CheckSquare, BookOpen, Briefcase, Bot, Users, Wallet];

export function SolutionSection() {
  const { t } = useTranslation();
  const modules = t("solution.modules", { returnObjects: true }) as string[];

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <motion.div
            className="flex-1"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">{t("solution.title")}</h2>
            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">{t("solution.subtitle")}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {modules.map((name, i) => {
                const Icon = MODULE_ICONS[i] ?? Layers;
                return (
                  <motion.div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                  >
                    <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0">
                      <Icon size={18} />
                    </div>
                    <span className="font-medium text-foreground text-sm">{name}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Right: Lottie animation — natural aspect ratio, no clipping */}
          <motion.div
            className="flex-1 w-full"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="relative rounded-2xl bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 shadow-xl flex items-center justify-center p-6" style={{ minHeight: "380px" }}>
              <div style={{ width: "100%", height: "320px" }}>
                <LottieAnimation
                  url="/animations/rocket.json"
                  fallback={
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white font-bold text-3xl shadow-md">U</div>
                      <span className="font-bold text-foreground">UPZ Core</span>
                    </div>
                  }
                  className="w-full h-full"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
