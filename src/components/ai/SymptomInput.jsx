import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";

export default function SymptomInput({ value, onChange, onAnalyze, loading, patientName }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium text-slate-700">
          Symptoms, Vitals & Observations
          {patientName && <span className="ml-2 text-cyan-600 font-normal">— {patientName}</span>}
        </Label>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter symptoms, vitals, and clinical observations...\n\nExample:\n- Patient: 45M\n- Chief complaint: chest pain radiating to left arm, onset 2 hours ago\n- BP: 140/90, HR: 102, SpO2: 96%\n- Diaphoresis present, mild dyspnea\n- ECG: ST elevation in leads II, III, aVF`}
          rows={7}
          className="mt-1.5 font-mono text-sm"
        />
      </div>
      <Button
        onClick={onAnalyze}
        disabled={loading || !value.trim()}
        className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
        ) : (
          <><Sparkles className="w-4 h-4 mr-2" /> Analyze with AI</>
        )}
      </Button>
    </div>
  );
}