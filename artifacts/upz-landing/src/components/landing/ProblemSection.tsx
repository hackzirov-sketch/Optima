import { useTranslation } from "react-i18next";

export function ProblemSection() {
  const { t } = useTranslation();
  const tools = t("problem.tools", { returnObjects: true }) as string[];

  return (
    <section className="bg-white py-20">
      <div className="container mx-auto max-w-4xl px-4 text-center">
        <h2 className="mb-4 text-3xl font-bold text-[#111827] md:text-4xl">{t("problem.title")}</h2>
        <p className="mb-10 text-lg text-[#6B7280] md:text-xl">{t("problem.subtitle")}</p>

        <div className="mx-auto mb-10 flex max-w-3xl flex-wrap justify-center gap-3">
          {tools.map((tool) => (
            <span key={tool} className="rounded-full border border-[#E5E7EB] bg-[#F7FAFC] px-4 py-2 text-sm font-semibold text-[#374151]">
              {tool}
            </span>
          ))}
        </div>

        <h3 className="text-2xl font-extrabold text-indigo-600 md:text-3xl">{t("problem.conclusion")}</h3>
      </div>
    </section>
  );
}
