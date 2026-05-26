import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

const TOOL_COLORS = [
  "bg-red-50 text-red-700 border-red-200",
  "bg-orange-50 text-orange-700 border-orange-200",
  "bg-green-50 text-green-700 border-green-200",
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-purple-50 text-purple-700 border-purple-200",
  "bg-pink-50 text-pink-700 border-pink-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-cyan-50 text-cyan-700 border-cyan-200",
];

export function ProblemSection() {
  const { t } = useTranslation();
  const tools = t("problem.tools", { returnObjects: true }) as string[];

  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4 text-center max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">{t("problem.title")}</h2>
          <p className="text-xl text-muted-foreground mb-12">{t("problem.subtitle")}</p>
        </motion.div>

        <div className="relative py-10 mb-12">
          <div className="flex flex-wrap justify-center gap-4 relative z-10 max-w-3xl mx-auto">
            {tools.map((tool, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8, y: -10 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.07 }}
              >
                <Badge variant="outline" className={`px-4 py-2 text-sm font-medium ${TOOL_COLORS[i % TOOL_COLORS.length]} shadow-sm`}>
                  {tool}
                </Badge>
              </motion.div>
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center -z-0">
            <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h3 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-blue-500">
            {t("problem.conclusion")}
          </h3>
        </motion.div>
      </div>
    </section>
  );
}
