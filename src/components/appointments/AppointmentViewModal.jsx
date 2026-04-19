import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function AppointmentViewModal({ open, onOpenChange, appointment }) {
  if (!appointment) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Appointment Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500">Patient</p>
              <p className="text-slate-700 font-medium">{appointment.patient_name || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Doctor</p>
              <p className="text-slate-700">Dr. {appointment.doctor_name || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Date</p>
              <p className="text-slate-700">
                {appointment.appointment_date ? format(new Date(appointment.appointment_date), "MMM d, yyyy") : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Time</p>
              <p className="text-slate-700">{appointment.appointment_time || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Type</p>
              <p className="text-slate-700">{appointment.type || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Status</p>
              <Badge className="bg-slate-100 text-slate-700 border-0">{appointment.status}</Badge>
            </div>
            <div>
              <p className="text-xs text-slate-500">Payment Mode</p>
              <p className="text-slate-700">{appointment.payment_mode || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Discount</p>
              <p className="text-slate-700">{appointment.discount != null ? `${Number(appointment.discount).toFixed(2)}%` : "-"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-slate-500">Priority</p>
              <p className="text-slate-700">{appointment.priority || "-"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-slate-500">Reason</p>
              <p className="text-slate-700">{appointment.reason || "-"}</p>
            </div>
            {appointment.notes && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500">Notes</p>
                <p className="text-slate-700 whitespace-pre-wrap">{appointment.notes}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
