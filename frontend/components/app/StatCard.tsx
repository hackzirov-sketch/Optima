import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  accent?: string;
  delay?: number;
}

export function StatCard({ label, value, icon: Icon, trend, trendUp, accent = "#6366F1", delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className="flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6B7280]">{label}</span>
        <div className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: `${accent}14` }}>
          <Icon className="h-5 w-5" style={{ color: accent }} />
        </div>
      </div>
      <div className="text-2xl font-bold text-[#111827]">{value}</div>
      {trend && (
        <div className={`text-xs font-semibold ${trendUp ? "text-emerald-600" : "text-rose-600"}`}>
          {trendUp ? "Up" : "Down"} {trend}
        </div>
      )}
    </motion.div>
  );
}
