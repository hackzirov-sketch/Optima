import { motion } from "framer-motion";
import { BookOpen, Target, FileStack, Users, Briefcase, DollarSign, ArrowDown } from "lucide-react";
import { LottieAnimation } from "./LottieAnimation";
import { useTranslation } from "react-i18next";

const STEP_ICONS = [BookOpen, Target, FileStack, Users, Briefcase, DollarSign];

export function FreelancerEcosystemSection() {
  const { t } = useTranslation();
  const steps = t("freelancer.steps", { returnObjects: true }) as string[];

  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="text-center mb-12">
            <motion.h2
              className="text-3xl md:text-4xl font-bold text-foreground mb-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              {t("freelancer.title")}
            </motion.h2>
            <motion.p
              className="text-lg text-muted-foreground max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              {t("freelancer.subtitle")}
            </motion.p>
          </div>

          {/* Main card */}
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-3xl p-8 md:p-10 shadow-lg">
            <div className="flex flex-col lg:flex-row gap-10 items-center">

              {/* Animation — natural size, no clipping */}
              <motion.div
                className="w-full lg:w-72 flex-shrink-0"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <div
                  className="rounded-2xl bg-white shadow-md border border-indigo-100 flex items-center justify-center p-2"
                  style={{ height: "260px" }}
                >
                  <LottieAnimation
                    url="/animations/freelance.json"
                    fallback={
                      <div className="flex items-center justify-center w-full h-full">
                        <Briefcase className="w-16 h-16 text-indigo-400" />
                      </div>
                    }
                    className="w-full h-full"
                  />
                </div>
              </motion.div>

              {/* Steps flow */}
              <div className="flex-1 w-full">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {steps.map((label, i) => {
                    const Icon = STEP_ICONS[i] ?? BookOpen;
                    return (
                      <motion.div
                        key={i}
                        className="flex flex-col items-center text-center gap-2"
                        initial={{ opacity: 0, scale: 0.85 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: i * 0.08 }}
                      >
                        <div className="w-16 h-16 rounded-2xl bg-white shadow-md border border-border flex items-center justify-center text-indigo-600">
                          <Icon className="w-8 h-8" />
                        </div>
                        <span className="font-semibold text-sm text-foreground leading-tight">{label}</span>

                        {/* Arrow only on mobile between items in same column */}
                        {i < steps.length - 1 && i % 3 !== 2 && (
                          <ArrowDown className="w-4 h-4 text-indigo-300 md:hidden" />
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Connector line decoration */}
                <div className="hidden md:flex items-center justify-center mt-4 gap-3">
                  {steps.map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-indigo-400" />
                      {i < steps.length - 1 && <div className="w-8 h-0.5 bg-indigo-200" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
