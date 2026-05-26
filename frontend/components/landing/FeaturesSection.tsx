import { motion } from "framer-motion";
import { Layers, BarChart3, Share2, Wallet, Bot, MessageSquare, BookOpen, Users, CheckSquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LottieAnimation } from "./LottieAnimation";
import { useTranslation } from "react-i18next";

type FeatureVisual =
  | { kind: "icon"; icon: React.ReactNode; bg: string }
  | { kind: "lottie"; url: string; fallbackIcon: React.ReactNode };

const FEATURE_VISUALS: FeatureVisual[] = [
  { kind: "icon", icon: <Layers className="w-10 h-10 text-indigo-500" />, bg: "from-indigo-50 to-indigo-100" },
  { kind: "lottie", url: "/animations/chat.json", fallbackIcon: <MessageSquare className="w-10 h-10 text-blue-500" /> },
  { kind: "icon", icon: <BarChart3 className="w-10 h-10 text-indigo-500" />, bg: "from-blue-50 to-indigo-50" },
  { kind: "lottie", url: "/animations/tasks.json", fallbackIcon: <CheckSquare className="w-10 h-10 text-indigo-500" /> },
  { kind: "lottie", url: "/animations/ai.json", fallbackIcon: <BookOpen className="w-10 h-10 text-blue-500" /> },
  { kind: "lottie", url: "/animations/freelance.json", fallbackIcon: <Users className="w-10 h-10 text-indigo-500" /> },
  { kind: "icon", icon: <Share2 className="w-10 h-10 text-blue-500" />, bg: "from-sky-50 to-blue-100" },
  { kind: "icon", icon: <Wallet className="w-10 h-10 text-indigo-500" />, bg: "from-violet-50 to-indigo-100" },
  { kind: "lottie", url: "/animations/ai2.json", fallbackIcon: <Bot className="w-10 h-10 text-blue-500" /> },
];

export function FeaturesSection() {
  const { t } = useTranslation();
  const items = t("features.items", { returnObjects: true }) as Array<{ title: string; description: string }>;

  return (
    <section id="features" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            {t("features.title")}
          </motion.h2>
          <motion.p
            className="text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            {t("features.subtitle")}
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((feature, i) => {
            const visual = FEATURE_VISUALS[i];
            const isLottie = visual?.kind === "lottie";

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
              >
                <Card className="h-full bg-card border-border/50 shadow-sm hover:shadow-lg transition-all group flex flex-col">
                  {/* Visual area - consistent height, no overflow clipping */}
                  <div
                    className={`w-full rounded-t-xl flex items-center justify-center ${
                      isLottie
                        ? "bg-gradient-to-br from-indigo-50 to-blue-50"
                        : `bg-gradient-to-br ${(visual as { kind: "icon"; icon: React.ReactNode; bg: string }).bg}`
                    }`}
                    style={{ height: "200px" }}
                  >
                    {isLottie ? (
                      <LottieAnimation
                        url={(visual as { kind: "lottie"; url: string; fallbackIcon: React.ReactNode }).url}
                        fallback={
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            {(visual as { kind: "lottie"; url: string; fallbackIcon: React.ReactNode }).fallbackIcon}
                          </div>
                        }
                        className="w-full h-full p-4"
                      />
                    ) : (
                      <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-white shadow-md border border-white/80 group-hover:scale-110 transition-transform">
                        {(visual as { kind: "icon"; icon: React.ReactNode; bg: string }).icon}
                      </div>
                    )}
                  </div>

                  <CardHeader className="pb-2 pt-5">
                    <CardTitle className="text-xl font-semibold">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <CardDescription className="text-base leading-relaxed text-muted-foreground">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
