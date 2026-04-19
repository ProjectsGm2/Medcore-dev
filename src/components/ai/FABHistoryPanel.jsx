import React from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock } from "lucide-react";

const statusConfig = {
  accepted: { label: "Accepted", color: "bg-emerald-100 text-emerald-700" },
  doctor_edited: { label: "Edited", color: "bg-cyan-100 text-cyan-700" },
  rejected: { label: "Re-analyzed", color: "bg-orange-100 text-orange-700" },
  ai_generated: { label: "AI Draft", color: "bg-violet-100 text-violet-700" },
};

export default function FABHistoryPanel({ records, onSelect }) {
  if (!records || records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Clock className="w-7 h-7 text-slate-300 mb-2" />
        <p className="text-sm text-slate-400">No diagnosis history yet</p>
        <p className="text-xs text-slate-300 mt-1">Analyzed cases will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {records.map((record) => {
        const cfg = statusConfig[record.status] || statusConfig.ai_generated;
        return (
          <button
            key={record.id}
            onClick={() => onSelect?.(record)}
            className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/30 transition-all group"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                <span className="text-sm font-medium text-slate-700 truncate">{record.patient_name || "Unknown Patient"}</span>
              </div>
              <Badge className={`${cfg.color} border-0 text-xs py-0 px-1.5 shrink-0`}>{cfg.label}</Badge>
            </div>
            <p className="text-xs text-slate-500 line-clamp-1 mb-1.5">
              {record.ai_diagnosis?.primary_diagnosis || "Pending AI analysis"}
            </p>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {record.created_date ? format(new Date(record.created_date), "MMM d, yyyy · HH:mm") : ""}
            </p>
          </button>
        );
      })}
    </div>
  );
}