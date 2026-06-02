import { lazy, Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";

const ChartsContent = lazy(() =>
  import("recharts").then((mod) => ({
    default: function ChartsInner() {
      const { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } = mod;
      const tooltipStyle = {
        contentStyle: { background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 16, color: "#111827", boxShadow: "0 12px 30px rgba(17,24,39,0.12)" },
        cursor: { fill: "rgba(99,102,241,0.08)" },
      };
      const WEEKLY_ACTIVITY = [
        { day: "Mon", tasks: 8, messages: 5 },
        { day: "Tue", tasks: 12, messages: 7 },
        { day: "Wed", tasks: 6, messages: 9 },
        { day: "Thu", tasks: 15, messages: 11 },
        { day: "Fri", tasks: 10, messages: 6 },
        { day: "Sat", tasks: 4, messages: 3 },
        { day: "Sun", tasks: 2, messages: 2 },
      ];
      const PRODUCTIVITY_DATA = [
        { week: "W1", score: 62 },
        { week: "W2", score: 74 },
        { week: "W3", score: 68 },
        { week: "W4", score: 81 },
        { week: "W5", score: 88 },
      ];
      return (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={WEEKLY_ACTIVITY} barGap={4}>
                <XAxis dataKey="day" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="tasks" fill="#6366F1" radius={[8, 8, 0, 0]} name="Tasks" />
                <Bar dataKey="messages" fill="#3B82F6" radius={[8, 8, 0, 0]} name="Messages" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={PRODUCTIVITY_DATA}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[50, 100]} tick={{ fill: "#6B7280", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="score" stroke="#10B981" strokeWidth={3} dot={{ fill: "#10B981", strokeWidth: 0, r: 4 }} activeDot={{ r: 6, fill: "#10B981" }} name="Score" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    },
  })),
);

export function DashboardCharts() {
  return (
    <Suspense fallback={<div className="flex h-60 items-center justify-center"><Spinner className="size-8 text-muted-foreground" /></div>}>
      <ChartsContent />
    </Suspense>
  );
}
