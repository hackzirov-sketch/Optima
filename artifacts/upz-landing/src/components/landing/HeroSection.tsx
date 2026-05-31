import { ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LottieAnimation } from "./LottieAnimation";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

export function HeroSection() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  return (
    <section className="bg-[#F7FAFC] pt-32 pb-20 md:pt-40 md:pb-24">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col items-start text-left">
            <Badge variant="secondary" className="mb-6 rounded-full border-indigo-100 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-white">
              <Zap className="mr-2 h-4 w-4" />
              {t("hero.badge")}
            </Badge>

            <h1 className="mb-6 max-w-3xl text-4xl font-black leading-[1.04] text-[#111827] md:text-6xl lg:text-7xl">
              {t("hero.headline1")}
              <br />
              <span className="text-indigo-600">{t("hero.headline2")}</span>
            </h1>

            <p className="mb-8 max-w-2xl text-lg leading-8 text-[#5F6B7A] md:text-xl">{t("hero.subheadline")}</p>

            <div className="flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row">
              <Button
                size="lg"
                onClick={() => navigate("/onboarding")}
                className="h-12 w-full rounded-xl border-0 bg-indigo-600 px-8 text-base text-white hover:bg-indigo-500 sm:w-auto"
                data-testid="button-hero-get-started"
              >
                {t("hero.getStarted")}
              </Button>
              <a
                href="#features"
                className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-8 text-base font-semibold text-[#111827] transition-colors hover:bg-slate-50 sm:w-auto"
                data-testid="button-hero-explore"
              >
                {t("hero.exploreFeatures")}
                <ArrowRight className="ms-2 h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[560px] rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <LottieAnimation url="/animations/hero.json" className="mx-auto h-full min-h-[300px] w-full max-w-[500px]" />
          </div>
        </div>
      </div>
    </section>
  );
}
