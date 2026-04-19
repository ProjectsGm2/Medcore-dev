import React, { useState } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, User, Stethoscope, Pill, FileText, Loader2 } from "lucide-react";
import SaleFormModal from "@/components/dispensary/SaleFormModal";
import { useToast } from "@/components/ui/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function PrescriptionDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const rxId = urlParams.get("id");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: prescriptions = [], isLoading } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => base44.entities.Prescription.list("-created_date", 500),
  });
  const { data: medicines = [] } = useQuery({
    queryKey: ["medicines"],
    queryFn: () => base44.entities.Medicine.list("-created_date", 500),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["medicine-categories"],
    queryFn: () => base44.dispensary.medicineCategories(),
  });
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => base44.auth.me(),
  });
  const [billOpen, setBillOpen] = useState(false);

  const rx = prescriptions.find((r) => r.id === rxId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
      </div>
    );
  }

  if (!rx) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">Prescription not found</p>
        <Link to={createPageUrl("Prescriptions")}>
          <Button variant="outline" className="mt-4">Back to Prescriptions</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to={createPageUrl("Prescriptions")}>
        <Button variant="ghost" className="text-slate-500 -ml-2">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
      </Link>

      {/* Prescription Card */}
      <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-teal-600 p-6 text-white">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5" />
            <span className="text-sm font-medium opacity-80">Prescription</span>
          </div>
          <h2 className="text-xl font-bold">{rx.diagnosis}</h2>
          <p className="text-sm opacity-80 mt-1">{rx.created_date ? format(new Date(rx.created_date), "MMMM d, yyyy") : ""}</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => setBillOpen(true)}>
              Generate Bill
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Patient & Doctor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
              <User className="w-5 h-5 text-cyan-600" />
              <div>
                <p className="text-xs text-slate-400">Patient</p>
                <p className="text-sm font-medium text-slate-700">{rx.patient_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
              <Stethoscope className="w-5 h-5 text-teal-600" />
              <div>
                <p className="text-xs text-slate-400">Doctor</p>
                <p className="text-sm font-medium text-slate-700">Dr. {rx.doctor_name}</p>
              </div>
            </div>
          </div>

          {/* Medicines */}
          {rx.medicines?.length > 0 && (
            <div>
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Pill className="w-4 h-4 text-cyan-600" /> Prescribed Medicines
              </h3>
              <div className="space-y-3">
                {rx.medicines.map((med, i) => (
                  <div key={i} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-700">{med.medicine_name}</p>
                      <Badge variant="outline" className="text-xs">#{i + 1}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      {med.dosage && (
                        <div>
                          <p className="text-xs text-slate-400">Dosage</p>
                          <p className="text-sm text-slate-600">{med.dosage}</p>
                        </div>
                      )}
                      {med.duration && (
                        <div>
                          <p className="text-xs text-slate-400">Duration</p>
                          <p className="text-sm text-slate-600">{med.duration}</p>
                        </div>
                      )}
                      {med.instructions && (
                        <div>
                          <p className="text-xs text-slate-400">Instructions</p>
                          <p className="text-sm text-slate-600">{med.instructions}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {rx.notes && (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-100">
              <p className="text-xs text-amber-600 font-medium mb-1">Additional Notes</p>
              <p className="text-sm text-slate-700">{rx.notes}</p>
            </div>
          )}
        </div>
      </div>
      <SaleFormModal
        open={billOpen}
        onOpenChange={setBillOpen}
        medicines={medicines}
        categories={categories}
        currentUser={me}
        defaultDoctorId={rx.doctor_id || undefined}
        defaultPatientId={rx.patient_id || undefined}
        prescription={rx}
        onSave={async (payload) => {
          try {
            await base44.dispensary.salesBillCreate(payload);
            toast({ title: "Success", description: "Bill generated successfully" });
            queryClient.invalidateQueries({ queryKey: ["sales-bills"] });
            queryClient.invalidateQueries({ queryKey: ["medicines"] });
          } catch (err) {
            toast({ title: "Error", description: err.message || "Failed to generate bill", variant: "destructive" });
            throw err;
          }
        }}
      />
    </div>
  );
}
