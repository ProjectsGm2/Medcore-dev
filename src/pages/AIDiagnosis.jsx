import React, { useState } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/ui/PageHeader";
import SymptomInput from "@/components/ai/SymptomInput";
import AIDiagnosisResult from "@/components/ai/AIDiagnosisResult";
import DoctorValidationPanel from "@/components/ai/DoctorValidationPanel";
import DiagnosisHistory from "@/components/ai/DiagnosisHistory";
import { Sparkles, History } from "lucide-react";

export default function AIDiagnosis({ currentUser }) {
  const queryClient = useQueryClient();

  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: () => base44.entities.Patient.list("-created_date", 200),
  });

  const { data: diagnosisRecords = [] } = useQuery({
    queryKey: ["diagnosis_records"],
    queryFn: () => base44.entities.DiagnosisRecord.list("-created_date", 200),
  });

  const myRecords = diagnosisRecords.filter((r) => r.doctor_id === currentUser?.id);
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
    setAiError(null);
    setCurrentRecord(null);

    const prompt = `You are a clinical AI assistant helping a doctor. Analyze the following patient case and provide a structured medical diagnosis.

Patient case:
${symptoms}
${selectedPatient ? `Patient details: ${selectedPatient.age != null ? `${selectedPatient.age}y ` : ""}${selectedPatient.gender || ""}${selectedPatient.date_of_birth ? `, DOB ${selectedPatient.date_of_birth}` : ""}. Known allergies: ${selectedPatient.known_allergies || "none"}. Medical history: ${selectedPatient.medical_notes || "none"}` : ""}

Provide a comprehensive clinical analysis with:
1. Primary diagnosis (most likely condition)
2. Confidence level (High/Medium/Low) based on the information provided
3. Differential diagnoses (2-4 other possibilities to rule out)
4. Suggested diagnostic tests to confirm
5. Possible treatments/management options
6. Brief clinical reasoning

Be specific and clinically accurate. Use proper medical terminology.`;

    try {
      const result = await base44.functions.invoke("invokeLLM", {
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            primary_diagnosis: { type: "string" },
            confidence_level: { type: "string" },
            differential_diagnoses: { type: "array", items: { type: "string" } },
            suggested_tests: { type: "array", items: { type: "string" } },
            possible_treatments: { type: "array", items: { type: "string" } },
            reasoning: { type: "string" },
          },
        },
      });

      setAiResult(result);

      // Save initial AI record
      if (selectedPatientId) {
        const record = await createRecord.mutateAsync({
          patient_id: selectedPatientId,
          patient_name: selectedPatient?.name || "",
          doctor_id: currentUser?.id,
          doctor_name: currentUser?.full_name,
          symptoms_input: symptoms,
          ai_diagnosis: result,
          status: "ai_generated",
          version_history: [
            {
              version: 1,
              action: "AI Generated",
              content: result.primary_diagnosis,
              timestamp: new Date().toISOString(),
              actor: "AI",
            },
          ],
        });
        setCurrentRecord(record);
      }
    } catch (err) {
      setAiError(err?.body?.message || err?.message || "AI request failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAccept = async ({ doctor_notes }) => {
    setSaving(true);
    const finalDiagnosis = aiResult?.primary_diagnosis;
    const history = [
      ...(currentRecord?.version_history || []),
      { version: (currentRecord?.version_history?.length || 0) + 1, action: "Accepted by Doctor", content: finalDiagnosis, timestamp: new Date().toISOString(), actor: currentUser?.full_name },
    ];
    if (currentRecord) {
      await updateRecord.mutateAsync({ id: currentRecord.id, data: { status: "accepted", final_diagnosis: finalDiagnosis, doctor_notes, version_history: history } });
    }
    setSaving(false);
    setAiResult(null);
    setSymptoms("");
    setCurrentRecord(null);
  };

  const handleSaveEdit = async ({ final_diagnosis, doctor_notes }) => {
    setSaving(true);
    const history = [
      ...(currentRecord?.version_history || []),
      { version: (currentRecord?.version_history?.length || 0) + 1, action: "Edited by Doctor", content: final_diagnosis, timestamp: new Date().toISOString(), actor: currentUser?.full_name },
    ];
    if (currentRecord) {
      await updateRecord.mutateAsync({ id: currentRecord.id, data: { status: "doctor_edited", final_diagnosis, doctor_notes, version_history: history } });
    }
    setSaving(false);
    setAiResult(null);
    setSymptoms("");
    setCurrentRecord(null);
  };

  const handleReject = async ({ reason }) => {
    setSaving(true);
    const history = [
      ...(currentRecord?.version_history || []),
      { version: (currentRecord?.version_history?.length || 0) + 1, action: "Rejected — Re-analyze requested", content: reason, timestamp: new Date().toISOString(), actor: currentUser?.full_name },
    ];
    if (currentRecord) {
      await updateRecord.mutateAsync({ id: currentRecord.id, data: { status: "rejected", version_history: history } });
    }
    // Re-analyze with additional context
    setSaving(false);
    setAiResult(null);
    setSymptoms((prev) => prev + `\n\nDoctor correction: ${reason}`);
  };

  if (currentUser?.role !== "doctor" && currentUser?.role !== "admin") {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">This feature is available for doctors only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Diagnosis Assistant"
        description="Enter symptoms and clinical observations to get AI-powered diagnostic suggestions"
      />

      <Tabs defaultValue="assistant">
        <TabsList>
          <TabsTrigger value="assistant" className="gap-1.5">
            <Sparkles className="w-4 h-4" /> AI Assistant
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="w-4 h-4" /> Diagnosis History ({myRecords.length})
          </TabsTrigger>
        </TabsList>

        {/* AI Assistant Tab */}
        <TabsContent value="assistant" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Panel */}
            <div className="bg-white rounded-xl border border-slate-200/60 p-5 space-y-4">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-600" /> Clinical Input
              </h3>

              <div>
                <Label className="text-sm text-slate-600">Select Patient (optional)</Label>
                <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a patient..." />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {p.age != null ? `${p.age}y ` : ""}{p.gender || ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <SymptomInput
                value={symptoms}
                onChange={setSymptoms}
                onAnalyze={handleAnalyze}
                loading={analyzing}
                patientName={selectedPatient?.name}
              />
            </div>

            {/* Result Panel */}
            <div className="bg-white rounded-xl border border-slate-200/60 p-5 space-y-4">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-600" /> AI Analysis
              </h3>

              {!aiResult && !analyzing && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-100 to-teal-100 flex items-center justify-center mb-3">
                    <Sparkles className="w-7 h-7 text-cyan-600" />
                  </div>
                  <p className="text-slate-500 text-sm">Enter symptoms and click "Analyze with AI"</p>
                  <p className="text-slate-400 text-xs mt-1">The AI will provide diagnosis, tests, and treatment suggestions</p>
                </div>
              )}

              {aiError && !analyzing && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {aiError}
                </div>
              )}

              {analyzing && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center mb-3 animate-pulse">
                    <Sparkles className="w-5 h-5 text-cyan-600" />
                  </div>
                  <p className="text-slate-500 text-sm">Analyzing clinical data...</p>
                </div>
              )}

              {aiResult && !analyzing && (
                <div className="space-y-4">
                  <AIDiagnosisResult diagnosis={aiResult} />
                  {currentRecord && (
                    <DoctorValidationPanel
                      aiDiagnosis={aiResult}
                      onAccept={handleAccept}
                      onSaveEdit={handleSaveEdit}
                      onReject={handleReject}
                      saving={saving}
                    />
                  )}
                  {!currentRecord && (
                    <p className="text-xs text-slate-400 text-center">Select a patient to save and validate this diagnosis.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <div className="bg-white rounded-xl border border-slate-200/60 p-5">
            <DiagnosisHistory records={myRecords} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}