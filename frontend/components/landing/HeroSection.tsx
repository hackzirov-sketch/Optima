'use client';

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, MessageCircle, WalletCards, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LottieAnimation } from "./LottieAnimation";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";

const heroProof = ["Workspace", "Chat", "Projects", "Bank", "AI"];

export function HeroSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = (path: string) => router.push(path);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <section className="relative overflow-hidden bg-muted pt-32 pb-20 md:pt-40 md:pb-28">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[560px] w-full max-w-7xl -translate-x-1/2 overflow-hidden">
          <div className="absolute left-[-10%] top-[-12%] h-[420px] w-[42%] rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute right-[-8%] top-[18%] h-[340px] w-[34%] rounded-full bg-blue-500/10 blur-3xl" />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent" />
      </div>

      <div className="container mx-auto px-4">
        <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
          <motion.div
            className="flex flex-col items-start text-left"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div variants={itemVariants} className="mb-6">
              <Badge variant="secondary" className="rounded-full border-indigo-100 bg-card px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-card">
                <Zap className="mr-2 h-4 w-4" />
                {t("hero.badge")}
              </Badge>
            </motion.div>

            <motion.h1
              variants={itemVariants}
              className="mb-6 max-w-3xl text-4xl font-black leading-[1.04] tracking-[-0.04em] text-foreground md:text-6xl lg:text-7xl"
            >
              {t("hero.headline1")}<br />
              <span className="bg-gradient-to-r from-indigo-500 to-blue-500 bg-clip-text text-transparent">
                {t("hero.headline2")}
              </span>
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="mb-8 max-w-2xl text-lg leading-8 text-[#5F6B7A] md:text-xl"
            >
              {t("hero.subheadline")}
            </motion.p>

            <motion.div variants={itemVariants} className="mb-8 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row">
              <Button size="lg" onClick={() => navigate("/onboarding")} className="h-12 w-full rounded-2xl border-0 bg-gradient-to-r from-indigo-500 to-blue-500 px-8 text-base text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-600 hover:to-blue-600 sm:w-auto" data-testid="button-hero-get-started">
                {t("hero.getStarted")}
              </Button>
              <a href="#features" className="inline-flex h-12 w-full items-center justify-center rounded-2xl px-8 text-base font-semibold text-foreground transition-colors hover:bg-card sm:w-auto" data-testid="button-hero-explore">
                {t("hero.exploreFeatures")}
                <ArrowRight className="ms-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
            </motion.div>

            <motion.div variants={itemVariants} className="flex flex-wrap gap-2">
              {heroProof.map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {item}
                </span>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            className="relative mx-auto w-full max-w-[620px]"
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          >
            <div className="relative overflow-hidden rounded-[36px] border border-white bg-card/80 p-4 shadow-2xl shadow-indigo-100/80 backdrop-blur-xl">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-400" />
              <div className="rounded-[28px] bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4">
                <LottieAnimation url="/animations/hero.json" className="mx-auto h-full min-h-[320px] w-full max-w-[520px]" />
              </div>
            </div>

            <div className="absolute -left-4 top-10 hidden rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur md:block">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-foreground">Team chat</p>
                  <p className="text-xs text-muted-foreground">5 unread updates</p>
                </div>
              </div>
            </div>

            <div className="absolute -right-3 bottom-12 hidden rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur md:block">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <WalletCards className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-foreground">$8,420</p>
                  <p className="text-xs text-muted-foreground">Universal Bank</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
