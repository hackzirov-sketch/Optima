import { Layers, MessageSquare, BarChart3, CheckSquare, BookOpen, Briefcase, Bot, Users, Wallet } from "lucide-react";
import { LottieAnimation } from "./LottieAnimation";
import { useTranslation } from "react-i18next";

const MODULE_ICONS = [Layers, MessageSquare, BarChart3, CheckSquare, BookOpen, Briefcase, Bot, Users, Wallet];

export function SolutionSection() {
  const { t } = useTranslation();
  const modules = t("solution.modules", { returnObjects: true }) as string[];

  return (
    <section className="bg-[#F7FAFC] py-24">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="mb-6 text-3xl font-bold text-[#111827] md:text-4xl">{t("solution.title")}</h2>
            <p className="mb-10 text-lg leading-relaxed text-[#6B7280]">{t("solution.subtitle")}</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {modules.map((name, i) => {
                const Icon = MODULE_ICONS[i] ?? Layers;
                return (
                  <div key={name} className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <Icon size={18} />
                    </span>
                    <span className="text-sm font-medium text-[#111827]">{name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white p-6">
            <LottieAnimation url="/animations/rocket.json" className="h-[320px] w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
