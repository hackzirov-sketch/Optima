import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

export function FinalCTASection() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  return (
    <section className="bg-white py-24">
      <div className="container mx-auto px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-4xl font-bold text-[#111827] md:text-5xl">{t("cta.title")}</h2>
          <p className="mb-10 text-xl leading-relaxed text-[#6B7280]">{t("cta.subtitle")}</p>

          <div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              onClick={() => navigate("/onboarding")}
              className="h-14 w-full rounded-xl border-0 bg-indigo-600 px-10 text-lg text-white hover:bg-indigo-500 sm:w-auto"
              data-testid="button-cta-get-started"
            >
              {t("cta.getStarted")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/onboarding")}
              className="h-14 w-full rounded-xl border-2 px-10 text-lg sm:w-auto"
              data-testid="button-cta-login"
            >
              {t("cta.login")}
            </Button>
          </div>

          <div className="text-sm font-medium text-[#6B7280]">{t("cta.joinCount", { count: "10,000" })}</div>
        </div>
      </div>
    </section>
  );
}
