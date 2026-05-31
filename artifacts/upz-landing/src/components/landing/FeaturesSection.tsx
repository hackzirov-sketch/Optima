import type { ReactNode } from "react";
import { Layers, BarChart3, Share2, Wallet, Bot, MessageSquare, BookOpen, Users, CheckSquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LottieAnimation } from "./LottieAnimation";
import { useTranslation } from "react-i18next";

type FeatureVisual =
  | { kind: "icon"; icon: ReactNode }
  | { kind: "lottie"; url: string; fallbackIcon: ReactNode };

const FEATURE_VISUALS: FeatureVisual[] = [
  { kind: "icon", icon: <Layers className="h-10 w-10 text-indigo-500" /> },
  { kind: "lottie", url: "/animations/chat.json", fallbackIcon: <MessageSquare className="h-10 w-10 text-blue-500" /> },
  { kind: "icon", icon: <BarChart3 className="h-10 w-10 text-indigo-500" /> },
  { kind: "lottie", url: "/animations/tasks.json", fallbackIcon: <CheckSquare className="h-10 w-10 text-indigo-500" /> },
  { kind: "lottie", url: "/animations/ai.json", fallbackIcon: <BookOpen className="h-10 w-10 text-blue-500" /> },
  { kind: "lottie", url: "/animations/freelance.json", fallbackIcon: <Users className="h-10 w-10 text-indigo-500" /> },
  { kind: "icon", icon: <Share2 className="h-10 w-10 text-blue-500" /> },
  { kind: "icon", icon: <Wallet className="h-10 w-10 text-indigo-500" /> },
  { kind: "lottie", url: "/animations/ai2.json", fallbackIcon: <Bot className="h-10 w-10 text-blue-500" /> },
];

export function FeaturesSection() {
  const { t } = useTranslation();
  const items = t("features.items", { returnObjects: true }) as Array<{ title: string; description: string }>;

  return (
    <section id="features" className="bg-white py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-[#111827] md:text-4xl">{t("features.title")}</h2>
          <p className="text-lg text-[#6B7280]">{t("features.subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((feature, i) => {
            const visual = FEATURE_VISUALS[i];
            const isLottie = visual?.kind === "lottie";

            return (
              <Card key={feature.title} className="flex h-full flex-col border-[#E5E7EB] bg-white">
                <div className="flex h-[180px] w-full items-center justify-center border-b border-[#E5E7EB] bg-[#F7FAFC]">
                  {isLottie ? (
                    <LottieAnimation url={visual.url} fallback={visual.fallbackIcon} className="h-full w-full p-4" />
                  ) : (
                    <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white">
                      {visual?.icon}
                    </span>
                  )}
                </div>

                <CardHeader className="pb-2 pt-5">
                  <CardTitle className="text-xl font-semibold text-[#111827]">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <CardDescription className="text-base leading-relaxed text-[#6B7280]">{feature.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
