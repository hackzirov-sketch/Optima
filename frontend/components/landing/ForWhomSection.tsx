import { motion } from "framer-motion";
import { Code, GraduationCap, UserCircle, Briefcase, Video, Megaphone, PenTool, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

const PERSONA_ICONS = [Code, GraduationCap, UserCircle, Briefcase, Video, Megaphone, PenTool, Users];

export function ForWhomSection() {
  const { t } = useTranslation();
  const personas = t("forWhom.personas", { returnObjects: true }) as Array<{ role: string; tags: string[] }>;

  return (
    <section id="for-whom" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            {t("forWhom.title")}
          </motion.h2>
          <motion.p
            className="text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            {t("forWhom.subtitle")}
          </motion.p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {personas.map((persona, i) => {
            const Icon = PERSONA_ICONS[i] ?? Users;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                whileHover={{ y: -4 }}
              >
                <Card className="h-full bg-card hover:border-indigo-200 transition-all shadow-sm hover:shadow-md">
                  <CardHeader className="pb-3 flex flex-row items-center gap-3 space-y-0">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h3 className="font-semibold text-lg">{persona.role}</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {persona.tags.map((tag, j) => (
                        <Badge key={j} variant="secondary" className="bg-muted text-muted-foreground hover:bg-muted/80 font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </div>
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
