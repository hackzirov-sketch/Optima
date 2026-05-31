import { UserPlus, Settings, Layout } from "lucide-react";
import { useTranslation } from "react-i18next";

const STEP_ICONS = [UserPlus, Settings, Layout];

export function HowItWorksSection() {
  const { t } = useTranslation();
  const steps = t("howItWorks.steps", { returnObjects: true }) as Array<{ title: string; desc: string }>;

  return (
    <section id="how-it-works" className="bg-[#F7FAFC] py-24">
      <div className="container mx-auto px-4">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-bold text-[#111827] md:text-4xl">{t("howItWorks.title")}</h2>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((step, i) => {
            const Icon = STEP_ICONS[i] ?? Layout;
            return (
              <article key={step.title} className="rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white">
                  {i + 1}
                </div>
                <Icon className="mx-auto mb-5 h-10 w-10 text-indigo-600" />
                <h3 className="mb-3 text-xl font-bold text-[#111827]">{step.title}</h3>
                <p className="leading-relaxed text-[#6B7280]">{step.desc}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
