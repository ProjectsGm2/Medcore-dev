import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Brain, FlaskConical, Pill, ChevronRight,
  CheckCircle2, Pencil, RotateCcw, Download, ShieldAlert
} from "lucide-react";

const confidenceColor = {
  High: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  Low: "bg-red-100 text-red-700 border-red-200",
};

const riskColor = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-emerald-100 text-emerald-700",
  Critical: "bg-red-200 text-red-800 font-bold",
};

export default function FABReportView({ diagnosis, onAccept, onEdit, onRegenerate, onDownloadPDF, saving }) {
  if (!diagnosis) return null;

  const conf = diagnosis.confidence_level || "Medium";
  const risk = diagnosis.risk_level || "Medium";

  return (
    <div className="space-y-3">
      {/* Safety Notice */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 leading-snug">
          <span className="font-semibold">Clinical Support Tool Only.</span> AI generated diagnosis must be validated by a licensed doctor before any medical decision.
        </p>
      </div>

      {/* Primary Diagnosis + Risk + Confidence */}
      <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-50 to-teal-50 border border-cyan-200">
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Primary Diagnosis</span>
          <Badge className={`${confidenceColor[conf]} border text-xs py-0 px-1.5`}>{conf} Confidence</Badge>
          <Badge className={`${riskColor[risk]} border-0 text-xs py-0 px-1.5 flex items-center gap-1`}>
            <ShieldAlert className="w-3 h-3" /> {risk} Risk
          </Badge>
        </div>
        <p className="text-sm font-bold text-slate-800">{diagnosis.primary_diagnosis}</p>
        {diagnosis.symptoms_summary && (
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{diagnosis.symptoms_summary}</p>
        )}
        {diagnosis.reasoning && (
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed italic">{diagnosis.reasoning}</p>
        )}
      </div>

      {/* Confidence Score bar */}
      {diagnosis.confidence_score != null && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Confidence Score</span>
            <span className="text-xs font-semibold text-slate-700">{diagnosis.confidence_score}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                diagnosis.confidence_score >= 70 ? "bg-emerald-500" :
                diagnosis.confidence_score >= 40 ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${diagnosis.confidence_score}%` }}
            />
          </div>
        </div>
      )}

      {/* Grid: Differentials / Tests / Treatments */}
      <div className="space-y-2">
        {diagnosis.differential_diagnoses?.length > 0 && (
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Brain className="w-3 h-3 text-violet-600" />
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Differential Diagnoses</p>
            </div>
            <ul className="space-y-0.5">
              {diagnosis.differential_diagnoses.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                  <ChevronRight className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />{d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {diagnosis.suggested_tests?.length > 0 && (
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-1.5">
              <FlaskConical className="w-3 h-3 text-cyan-600" />
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Suggested Tests</p>
            </div>
            <ul className="space-y-0.5">
              {diagnosis.suggested_tests.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                  <ChevronRight className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />{t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {diagnosis.possible_treatments?.length > 0 && (
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Pill className="w-3 h-3 text-teal-600" />
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Recommended Treatment</p>
            </div>
            <ul className="space-y-0.5">
              {diagnosis.possible_treatments.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                  <ChevronRight className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />{t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
        <Button onClick={onAccept} disabled={saving} size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-2.5">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Accept
        </Button>
        <Button onClick={onEdit} disabled={saving} variant="outline" size="sm"
          className="border-cyan-300 text-cyan-700 hover:bg-cyan-50 text-xs h-7 px-2.5">
          <Pencil className="w-3 h-3 mr-1" /> Edit
        </Button>
        <Button onClick={onRegenerate} disabled={saving} variant="outline" size="sm"
          className="border-orange-300 text-orange-700 hover:bg-orange-50 text-xs h-7 px-2.5">
          <RotateCcw className="w-3 h-3 mr-1" /> Regenerate
        </Button>
        <Button onClick={onDownloadPDF} disabled={saving} variant="outline" size="sm"
          className="border-slate-300 text-slate-600 hover:bg-slate-50 text-xs h-7 px-2.5 ml-auto">
          <Download className="w-3 h-3 mr-1" /> PDF
        </Button>
      </div>
    </div>
  );
}