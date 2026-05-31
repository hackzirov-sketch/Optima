import { Sparkles, Brain, Clock, FileText, Lightbulb, Users } from "lucide-react";
import { LottieAnimation } from "./LottieAnimation";
import { useTranslation } from "react-i18next";

const AI_ICONS = [Sparkles, Brain, Clock, FileText, Lightbulb, Users];

export function AIAssistantSection() {
  const { t } = useTranslation();
  const features = t("ai.features", { returnObjects: true }) as string[];

  return (
    <section id="ai-assistant" className="bg-[#111827] py-24">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="text-white">
            <h2 className="mb-6 text-3xl font-bold leading-tight md:text-5xl">{t("ai.title")}</h2>
            <p className="mb-10 max-w-xl text-lg text-indigo-100 md:text-xl">{t("ai.subtitle")}</p>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {features.map((feature, i) => {
                const Icon = AI_ICONS[i] ?? Sparkles;
                return (
                  <div key={feature} className="flex items-center gap-4">
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/15">
                      <Icon className="h-5 w-5 text-indigo-300" />
                    </span>
                    <span className="text-base font-medium text-indigo-50">{feature}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex h-[360px] w-full items-center justify-center rounded-2xl border border-indigo-500/20 bg-[#151F35]">
            <LottieAnimation url="/animations/learning.json" fallback={<Brain className="h-20 w-20 text-indigo-300" />} className="h-full w-full p-6" />
          </div>
        </div>
      </div>
    </section>
  );
}
