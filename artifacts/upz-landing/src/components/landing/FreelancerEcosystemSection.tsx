import { BookOpen, Target, FileStack, Users, Briefcase, DollarSign } from "lucide-react";
import { LottieAnimation } from "./LottieAnimation";
import { useTranslation } from "react-i18next";

const STEP_ICONS = [BookOpen, Target, FileStack, Users, Briefcase, DollarSign];

export function FreelancerEcosystemSection() {
  const { t } = useTranslation();
  const steps = t("freelancer.steps", { returnObjects: true }) as string[];

  return (
    <section className="bg-[#F7FAFC] py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold text-[#111827] md:text-4xl">{t("freelancer.title")}</h2>
            <p className="mx-auto max-w-2xl text-lg text-[#6B7280]">{t("freelancer.subtitle")}</p>
          </div>

          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 md:p-10">
            <div className="grid items-center gap-10 lg:grid-cols-[18rem_1fr]">
              <div className="flex h-[260px] items-center justify-center rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-2">
                <LottieAnimation url="/animations/freelance.json" fallback={<Briefcase className="h-16 w-16 text-indigo-400" />} className="h-full w-full" />
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {steps.map((label, i) => {
                  const Icon = STEP_ICONS[i] ?? BookOpen;
                  return (
                    <div key={label} className="flex flex-col items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4 text-center">
                      <Icon className="h-8 w-8 text-indigo-600" />
                      <span className="text-sm font-semibold leading-tight text-[#111827]">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
