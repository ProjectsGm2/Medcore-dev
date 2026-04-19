import React from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, Pencil, RotateCcw, Sparkles } from "lucide-react";

const statusConfig = {
  accepted: { label: "Accepted", color: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2 },
  doctor_edited: { label: "Edited", color: "bg-cyan-100 text-cyan-700", Icon: Pencil },
  rejected: { label: "Re-analyzed", color: "bg-orange-100 text-orange-700", Icon: RotateCcw },
  ai_generated: { label: "AI Generated", color: "bg-violet-100 text-violet-700", Icon: Sparkles },
};

const actionIcon = {
  "AI Generated": Sparkles,
  "Accepted by Doctor": CheckCircle2,
  "Edited by Doctor": Pencil,
  "Rejected — Re-analyze requested": RotateCcw,
};

export default function DiagnosisHistory({ records }) {
  if (!records || records.length === 0) {
    return (
      <div className="text-center py-10">
        <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No diagnosis history yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {records.map((record) => {
        const cfg = statusConfig[record.status] || statusConfig.ai_generated;
        const Icon = cfg.Icon;
        return (
          <div key={record.id} className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-slate-500" />
                <span className="font-semibold text-sm text-slate-700">{record.patient_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${cfg.color} border-0 text-xs`}>{cfg.label}</Badge>
                <span className="text-xs text-slate-400">
                  {record.created_date ? format(new Date(record.created_date), "MMM d, yyyy HH:mm") : ""}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* Symptoms */}
              <div>
                <p className="text-xs text-slate-400 mb-1">Symptoms / Input</p>
                <p className="text-sm text-slate-600 line-clamp-2">{record.symptoms_input}</p>
              </div>

              {/* AI Diagnosis */}
              {record.ai_diagnosis?.primary_diagnosis && (
                <div>
                  <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> AI Diagnosis
                  </p>
                  <p className="text-sm font-medium text-slate-700">{record.ai_diagnosis.primary_diagnosis}</p>
                </div>
              )}

              {/* Final Diagnosis */}
              {record.final_diagnosis && (
                <div>
                  <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Final Diagnosis
                  </p>
                  <p className="text-sm font-medium text-emerald-700">{record.final_diagnosis}</p>
                </div>
              )}

              {/* Notes */}
              {record.doctor_notes && (
                <div className="p-2 rounded bg-amber-50 border border-amber-100">
                  <p className="text-xs text-amber-700"><span className="font-semibold">Notes:</span> {record.doctor_notes}</p>
                </div>
              )}

              {/* Version history */}
              {record.version_history?.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Audit Trail
                  </p>
                  <div className="space-y-1.5">
                    {record.version_history.map((v, i) => {
                      const VIcon = actionIcon[v.action] || Clock;
                      return (
                        <div key={i} className="flex items-start gap-2">
                          <VIcon className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />
                          <div>
                            <span className="text-xs font-medium text-slate-600">{v.action}</span>
                            {v.content && <p className="text-xs text-slate-400 line-clamp-1">{v.content}</p>}
                            <p className="text-xs text-slate-300">{v.timestamp ? format(new Date(v.timestamp), "MMM d HH:mm") : ""}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}