import React from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FlaskConical, Pill, Brain, ChevronRight } from "lucide-react";

const confidenceColor = {
  High: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  Low: "bg-red-100 text-red-700 border-red-200",
};

export default function AIDiagnosisResult({ diagnosis }) {
  if (!diagnosis) return null;

  const conf = diagnosis.confidence_level || "Medium";

  return (
    <div className="space-y-4">
      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">
          <span className="font-semibold">Clinical Assistance Only.</span> AI suggestions are for reference only. Final decision must be validated by the doctor.
        </p>
      </div>

      {/* Primary Diagnosis */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-50 to-teal-50 border border-cyan-200">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Primary Diagnosis</p>
          <Badge className={`${confidenceColor[conf]} border text-xs`}>
            {conf} Confidence
          </Badge>
        </div>
        <p className="text-lg font-bold text-slate-800">{diagnosis.primary_diagnosis}</p>
        {diagnosis.reasoning && (
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">{diagnosis.reasoning}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Differential Diagnoses */}
        {diagnosis.differential_diagnoses?.length > 0 && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-2">
              <Brain className="w-3.5 h-3.5 text-violet-600" />
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Differentials</p>
            </div>
            <ul className="space-y-1">
              {diagnosis.differential_diagnoses.map((d, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-slate-700">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggested Tests */}
        {diagnosis.suggested_tests?.length > 0 && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-2">
              <FlaskConical className="w-3.5 h-3.5 text-cyan-600" />
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Suggested Tests</p>
            </div>
            <ul className="space-y-1">
              {diagnosis.suggested_tests.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-slate-700">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Treatments */}
        {diagnosis.possible_treatments?.length > 0 && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-2">
              <Pill className="w-3.5 h-3.5 text-teal-600" />
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Possible Treatments</p>
            </div>
            <ul className="space-y-1">
              {diagnosis.possible_treatments.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-slate-700">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}