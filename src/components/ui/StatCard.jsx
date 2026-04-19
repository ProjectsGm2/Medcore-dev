import React from "react";
import { cn } from "@/lib/utils";

export default function StatCard({ title, value, subtitle, icon: Icon, color = "cyan", trend }) {
  const colorMap = {
    cyan: "from-cyan-500 to-cyan-600",
    teal: "from-teal-500 to-teal-600",
    violet: "from-violet-500 to-violet-600",
    amber: "from-amber-500 to-amber-600",
    rose: "from-rose-500 to-rose-600",
    emerald: "from-emerald-500 to-emerald-600",
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-slate-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center", colorMap[color])}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span className={cn("font-medium", trend > 0 ? "text-emerald-600" : "text-rose-600")}>
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
          <span className="text-slate-400">vs last week</span>
        </div>
      )}
    </div>
  );
}