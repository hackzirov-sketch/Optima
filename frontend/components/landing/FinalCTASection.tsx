'use client';

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";

export function FinalCTASection() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = (path: string) => router.push(path);

  return (
    <section className="py-32 bg-background relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-indigo-500/10 to-blue-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      <div className="container mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">{t("cta.title")}</h2>
          <p className="text-xl text-muted-foreground mb-10 leading-relaxed">{t("cta.subtitle")}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Button size="lg" onClick={() => navigate("/onboarding")} className="w-full sm:w-auto h-14 px-10 text-lg bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-xl shadow-indigo-500/20 border-0 rounded-xl" data-testid="button-cta-get-started">
              {t("cta.getStarted")}
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/onboarding")} className="w-full sm:w-auto h-14 px-10 text-lg border-2 rounded-xl" data-testid="button-cta-login">
              {t("cta.login")}
            </Button>
          </div>

          <div className="text-sm font-medium text-muted-foreground">
            {t("cta.joinCount", { count: "10,000" })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
