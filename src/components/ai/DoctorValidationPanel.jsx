import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Pencil, RotateCcw, Save, X } from "lucide-react";

export default function DoctorValidationPanel({
  aiDiagnosis,
  onAccept,
  onSaveEdit,
  onReject,
  saving,
}) {
  const [mode, setMode] = useState(null); // null | 'edit' | 'reject'
  const [editedDiagnosis, setEditedDiagnosis] = useState(aiDiagnosis?.primary_diagnosis || "");
  const [doctorNotes, setDoctorNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const handleAccept = () => {
    onAccept({ doctor_notes: doctorNotes });
  };

  const handleSaveEdit = () => {
    onSaveEdit({ final_diagnosis: editedDiagnosis, doctor_notes: doctorNotes });
  };

  const handleReject = () => {
    onReject({ reason: rejectReason });
    setMode(null);
    setRejectReason("");
  };

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Doctor Validation</p>

      {/* Notes always visible */}
      <div>
        <Label className="text-xs text-slate-600">Doctor Notes (optional)</Label>
        <Textarea
          value={doctorNotes}
          onChange={(e) => setDoctorNotes(e.target.value)}
          placeholder="Add clinical notes, observations, or context..."
          rows={2}
          className="mt-1"
        />
      </div>

      {/* Edit panel */}
      {mode === "edit" && (
        <div>
          <Label className="text-xs text-slate-600">Edit Diagnosis</Label>
          <Textarea
            value={editedDiagnosis}
            onChange={(e) => setEditedDiagnosis(e.target.value)}
            rows={3}
            className="mt-1 font-medium"
          />
        </div>
      )}

      {/* Reject reason */}
      {mode === "reject" && (
        <div>
          <Label className="text-xs text-slate-600">Reason for re-analysis</Label>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Describe what's incorrect or add more context for re-analysis..."
            rows={3}
            className="mt-1"
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {mode === null && (
          <>
            <Button
              onClick={handleAccept}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Accept Diagnosis
            </Button>
            <Button
              onClick={() => setMode("edit")}
              variant="outline"
              size="sm"
              className="border-cyan-300 text-cyan-700 hover:bg-cyan-50"
            >
              <Pencil className="w-4 h-4 mr-1.5" /> Edit Diagnosis
            </Button>
            <Button
              onClick={() => setMode("reject")}
              variant="outline"
              size="sm"
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" /> Re-Diagnose
            </Button>
          </>
        )}

        {mode === "edit" && (
          <>
            <Button onClick={handleSaveEdit} disabled={saving} size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white">
              <Save className="w-4 h-4 mr-1.5" /> Save Edited Diagnosis
            </Button>
            <Button onClick={() => setMode(null)} variant="ghost" size="sm">
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          </>
        )}

        {mode === "reject" && (
          <>
            <Button onClick={handleReject} disabled={saving || !rejectReason.trim()} size="sm" className="bg-orange-600 hover:bg-orange-700 text-white">
              <RotateCcw className="w-4 h-4 mr-1.5" /> Re-Analyze
            </Button>
            <Button onClick={() => setMode(null)} variant="ghost" size="sm">
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}