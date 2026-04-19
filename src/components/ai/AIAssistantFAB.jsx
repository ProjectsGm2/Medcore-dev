import React, { useState, useRef } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, X, ChevronDown, Loader2, History, Stethoscope,
  AlertTriangle, ArrowLeft, Save
} from "lucide-react";
import { cn } from "@/lib/utils";
import FABReportView from "./FABReportView";
import FABHistoryPanel from "./FABHistoryPanel";
import { jsPDF } from "jspdf";

// Screens: 'input' | 'result' | 'history' | 'edit' | 'notes'
export default function AIAssistantFAB({ currentUser }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState("input");
  const [symptoms, setSymptoms] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editedDiagnosis, setEditedDiagnosis] = useState("");
  const [doctorNotes, setDoctorNotes] = useState("");
  const panelRef = useRef(null);

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => base44.entities.Patient.list("-created_date", 200),
    enabled: open,
  });

  const { data: diagnosisRecords = [] } = useQuery({
    queryKey: ["diagnosis_records"],
    queryFn: () => base44.entities.DiagnosisRecord.list("-created_date", 100),
    enabled: open,
  });

  const myRecords = currentUser
    ? diagnosisRecords.filter((r) => r.doctor_id === currentUser.id)
    : diagnosisRecords;

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  const createRecord = useMutation({
    mutationFn: (data) => base44.entities.DiagnosisRecord.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["diagnosis_records"] }),
  });

  const updateRecord = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DiagnosisRecord.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["diagnosis_records"] }),
  });

  const handleAnalyze = async () => {
    if (!symptoms.trim()) return;
    setAnalyzing(true);
    setAiResult(null);
    setScreen("input");

    const prompt = `You are a clinical AI assistant. Analyze the following patient case and provide a structured medical diagnosis report.

${symptoms}
${selectedPatient ? `Patient: ${selectedPatient.age != null ? `${selectedPatient.age}y ` : ""}${selectedPatient.gender || ""}${selectedPatient.date_of_birth ? `, DOB ${selectedPatient.date_of_birth}` : ""}. Allergies: ${selectedPatient.known_allergies || "none"}. History: ${selectedPatient.medical_notes || "none"}` : ""}

Provide:
1. symptoms_summary: A 1-2 sentence summary of the presented symptoms
2. primary_diagnosis: Most likely diagnosis
3. confidence_level: High / Medium / Low
4. confidence_score: 0-100 integer
5. risk_level: Critical / High / Medium / Low
6. differential_diagnoses: 3-4 other conditions to rule out
7. suggested_tests: Specific diagnostic tests to confirm
8. possible_treatments: Recommended management options
9. reasoning: Brief clinical reasoning (2-3 sentences)

Be specific and clinically accurate.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          symptoms_summary: { type: "string" },
          primary_diagnosis: { type: "string" },
          confidence_level: { type: "string" },
          confidence_score: { type: "number" },
          risk_level: { type: "string" },
          differential_diagnoses: { type: "array", items: { type: "string" } },
          suggested_tests: { type: "array", items: { type: "string" } },
          possible_treatments: { type: "array", items: { type: "string" } },
          reasoning: { type: "string" },
        },
      },
    });

    setAiResult(result);
    setEditedDiagnosis(result.primary_diagnosis || "");

    if (selectedPatientId && currentUser) {
      const record = await createRecord.mutateAsync({
        patient_id: selectedPatientId,
        patient_name: selectedPatient?.name || "",
        doctor_id: currentUser.id,
        doctor_name: currentUser.full_name,
        symptoms_input: symptoms,
        ai_diagnosis: result,
        status: "ai_generated",
        version_history: [{
          version: 1,
          action: "AI Generated",
          content: result.primary_diagnosis,
          timestamp: new Date().toISOString(),
          actor: "AI",
        }],
      });
      setCurrentRecord(record);
    }

    setAnalyzing(false);
    setScreen("result");
  };

  const addVersion = (record, action, content) => [
    ...(record?.version_history || []),
    {
      version: (record?.version_history?.length || 0) + 1,
      action,
      content,
      timestamp: new Date().toISOString(),
      actor: currentUser?.full_name || "Doctor",
    },
  ];

  const handleAccept = async () => {
    if (!currentRecord) { resetToInput(); return; }
    setSaving(true);
    await updateRecord.mutateAsync({
      id: currentRecord.id,
      data: {
        status: "accepted",
        final_diagnosis: aiResult.primary_diagnosis,
        doctor_notes: doctorNotes,
        version_history: addVersion(currentRecord, "Accepted by Doctor", aiResult.primary_diagnosis),
      },
    });
    setSaving(false);
    resetToInput();
  };

  const handleSaveEdit = async () => {
    if (!currentRecord) { resetToInput(); return; }
    setSaving(true);
    await updateRecord.mutateAsync({
      id: currentRecord.id,
      data: {
        status: "doctor_edited",
        final_diagnosis: editedDiagnosis,
        doctor_notes: doctorNotes,
        version_history: addVersion(currentRecord, "Edited by Doctor", editedDiagnosis),
      },
    });
    setSaving(false);
    resetToInput();
  };

  const handleRegenerate = async () => {
    setScreen("input");
    setAiResult(null);
    setCurrentRecord(null);
    if (currentRecord) {
      await updateRecord.mutateAsync({
        id: currentRecord.id,
        data: {
          status: "rejected",
          version_history: addVersion(currentRecord, "Regeneration requested", ""),
        },
      });
    }
  };

  const handleDownloadPDF = () => {
    if (!aiResult) return;
    const doc = new jsPDF();
    let y = 20;
    const lh = 7;
    const addLine = (text, size = 11, bold = false) => {
      doc.setFontSize(size);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      const lines = doc.splitTextToSize(text, 170);
      lines.forEach((l) => { doc.text(l, 20, y); y += lh; });
    };

    addLine("MedCore — AI Diagnosis Report", 16, true);
    y += 4;
    addLine(`Patient: ${selectedPatient?.name || "N/A"} | Date: ${new Date().toLocaleDateString()}`, 10);
    addLine(`Doctor: ${currentUser?.full_name || "N/A"}`, 10);
    y += 4;
    if (aiResult.symptoms_summary) { addLine("Symptoms Summary", 12, true); addLine(aiResult.symptoms_summary); y += 3; }
    addLine("Primary Diagnosis", 12, true);
    addLine(aiResult.primary_diagnosis);
    addLine(`Confidence: ${aiResult.confidence_level} (${aiResult.confidence_score ?? "—"}%) | Risk Level: ${aiResult.risk_level}`, 10);
    y += 3;
    if (aiResult.reasoning) { addLine("Clinical Reasoning", 12, true); addLine(aiResult.reasoning); y += 3; }
    if (aiResult.differential_diagnoses?.length) {
      addLine("Differential Diagnoses", 12, true);
      aiResult.differential_diagnoses.forEach((d) => addLine(`• ${d}`));
      y += 3;
    }
    if (aiResult.suggested_tests?.length) {
      addLine("Suggested Tests", 12, true);
      aiResult.suggested_tests.forEach((t) => addLine(`• ${t}`));
      y += 3;
    }
    if (aiResult.possible_treatments?.length) {
      addLine("Recommended Treatments", 12, true);
      aiResult.possible_treatments.forEach((t) => addLine(`• ${t}`));
      y += 3;
    }
    if (doctorNotes) { addLine("Doctor Notes", 12, true); addLine(doctorNotes); y += 3; }
    y += 4;
    addLine("⚠ AI generated diagnosis is a clinical support tool. Final medical decisions must be validated by a licensed doctor.", 9);

    doc.save(`AI_Diagnosis_${selectedPatient?.name || "Report"}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const resetToInput = () => {
    setScreen("input");
    setAiResult(null);
    setCurrentRecord(null);
    setSymptoms("");
    setDoctorNotes("");
    setEditedDiagnosis("");
    setSelectedPatientId("");
  };

  const screenTitle = {
    input: "AI Diagnosis Assistant",
    result: "Diagnosis Report",
    history: "Diagnosis History",
    edit: "Edit Diagnosis",
    notes: "Add Doctor Notes",
  }[screen];

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300",
          "bg-gradient-to-br from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700",
          "ring-4 ring-white hover:scale-110",
          open && "rotate-45 scale-95"
        )}
        aria-label="AI Diagnosis Assistant"
      >
        {open ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Stethoscope className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className={cn(
            "fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-24px)]",
            "bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col",
            "max-h-[calc(100vh-130px)]"
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 shrink-0 bg-gradient-to-r from-cyan-600 to-teal-600 rounded-t-2xl">
            {screen !== "input" && (
              <button
                onClick={() => screen === "result" || screen === "history" ? setScreen("input") : setScreen("result")}
                className="p-1 rounded-lg hover:bg-white/20 text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">{screenTitle}</p>
              <p className="text-xs text-cyan-100">MedCore AI · Clinical Support</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setScreen(screen === "history" ? "input" : "history")}
                className={cn("p-1.5 rounded-lg hover:bg-white/20 text-white", screen === "history" && "bg-white/20")}
                title="View History"
              >
                <History className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20 text-white">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">

            {/* INPUT SCREEN */}
            {screen === "input" && (
              <div className="space-y-3">
                {/* Safety disclaimer */}
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 leading-snug">
                    AI generated diagnosis is a clinical support tool. Final medical decisions must be validated by a licensed doctor.
                  </p>
                </div>

                {/* Patient selector */}
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Patient (optional)</label>
                  <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select patient…" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.name} — {p.age != null ? `${p.age}y ` : ""}{p.gender || ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Symptom input */}
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">
                    Clinical Observations
                    {selectedPatient && <span className="text-cyan-600 ml-1">— {selectedPatient.name}</span>}
                  </label>
                  <Textarea
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    placeholder={`Enter symptoms, vitals, lab results, history...\n\nExample:\n• 45M, chest pain radiating to left arm\n• BP: 140/90, HR: 102, SpO2: 96%\n• Diaphoresis, mild dyspnea\n• ECG: ST elevation II, III, aVF`}
                    rows={6}
                    className="text-xs font-mono resize-none"
                  />
                </div>

                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing || !symptoms.trim()}
                  className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white text-sm h-9"
                >
                  {analyzing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing clinical data...</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" /> Analyze with AI</>
                  )}
                </Button>

                {myRecords.length > 0 && (
                  <button
                    onClick={() => setScreen("history")}
                    className="w-full text-center text-xs text-cyan-600 hover:text-cyan-800 py-1 flex items-center justify-center gap-1"
                  >
                    <History className="w-3.5 h-3.5" /> View {myRecords.length} previous diagnoses
                  </button>
                )}
              </div>
            )}

            {/* ANALYZING animation */}
            {screen === "input" && analyzing && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-100 to-teal-100 flex items-center justify-center mb-3 animate-pulse">
                  <Sparkles className="w-6 h-6 text-cyan-600" />
                </div>
                <p className="text-sm text-slate-500">Running clinical analysis…</p>
                <p className="text-xs text-slate-400 mt-1">This may take a few seconds</p>
              </div>
            )}

            {/* RESULT SCREEN */}
            {screen === "result" && aiResult && (
              <div className="space-y-3">
                <FABReportView
                  diagnosis={aiResult}
                  saving={saving}
                  onAccept={() => setScreen("notes")}
                  onEdit={() => setScreen("edit")}
                  onRegenerate={handleRegenerate}
                  onDownloadPDF={handleDownloadPDF}
                />
              </div>
            )}

            {/* EDIT SCREEN */}
            {screen === "edit" && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Edit Diagnosis</p>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Final Diagnosis</label>
                  <Textarea
                    value={editedDiagnosis}
                    onChange={(e) => setEditedDiagnosis(e.target.value)}
                    rows={3}
                    className="text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Doctor Notes</label>
                  <Textarea
                    value={doctorNotes}
                    onChange={(e) => setDoctorNotes(e.target.value)}
                    placeholder="Add clinical notes or context..."
                    rows={3}
                    className="text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveEdit} disabled={saving} size="sm"
                    className="bg-cyan-600 hover:bg-cyan-700 text-white flex-1 text-xs">
                    <Save className="w-3.5 h-3.5 mr-1.5" />{saving ? "Saving…" : "Save Edited Diagnosis"}
                  </Button>
                  <Button onClick={() => setScreen("result")} variant="ghost" size="sm" className="text-xs">
                    Cancel
                  </Button>
                </div>
                {!currentRecord && (
                  <p className="text-xs text-slate-400 text-center">Select a patient to save the record.</p>
                )}
              </div>
            )}

            {/* NOTES / ACCEPT SCREEN */}
            {screen === "notes" && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Confirm & Add Notes</p>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-xs text-emerald-600 mb-1 font-medium">Accepting Diagnosis:</p>
                  <p className="text-sm font-bold text-slate-800">{aiResult?.primary_diagnosis}</p>
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Doctor Notes (optional)</label>
                  <Textarea
                    value={doctorNotes}
                    onChange={(e) => setDoctorNotes(e.target.value)}
                    placeholder="Add any clinical observations, context, or follow-up instructions..."
                    rows={4}
                    className="text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAccept} disabled={saving} size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1 text-xs">
                    {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "✓ Accept & Save"}
                  </Button>
                  <Button onClick={() => setScreen("result")} variant="ghost" size="sm" className="text-xs">
                    Back
                  </Button>
                </div>
                {!currentRecord && (
                  <p className="text-xs text-slate-400 text-center">Select a patient above to persist this record.</p>
                )}
              </div>
            )}

            {/* HISTORY SCREEN */}
            {screen === "history" && (
              <FABHistoryPanel
                records={myRecords}
                onSelect={(record) => {
                  setAiResult(record.ai_diagnosis);
                  setEditedDiagnosis(record.ai_diagnosis?.primary_diagnosis || "");
                  setCurrentRecord(record);
                  setSelectedPatientId(record.patient_id || "");
                  setSymptoms(record.symptoms_input || "");
                  setScreen("result");
                }}
              />
            )}
          </div>

          {/* Footer badge */}
          <div className="px-4 py-2.5 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" /> MedCore AI · Clinical Support
              </span>
              <Badge variant="outline" className="text-xs py-0 border-amber-300 text-amber-600">
                Doctor Validation Required
              </Badge>
            </div>
          </div>
        </div>
      )}
    </>
  );
}