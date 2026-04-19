import React, { useState } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import StatCard from "@/components/ui/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  Calendar,
  DollarSign,
  AlertTriangle,
  Clock,
  ArrowRight,
  UserPlus,
  Loader2,
  Stethoscope,
} from "lucide-react";
import PrescriptionFormModal from "@/components/opd/PrescriptionFormModal";

const today = format(new Date(), "yyyy-MM-dd");

export default function Dashboard({ currentUser }) {
  const role = currentUser?.role || "doctor";
  const [rxModalOpen, setRxModalOpen] = useState(false);
  const [selectedApt, setSelectedApt] = useState(null);

  const { data: patients = [], isLoading: pLoading } = useQuery({
    queryKey: ["patients"],
    queryFn: () => base44.entities.Patient.list("-created_date", 100),
  });

  const { data: appointments = [], isLoading: aLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => base44.entities.Appointment.list("-appointment_date", 200),
  });

  const handleAddRx = (apt) => {
    setSelectedApt(apt);
    setRxModalOpen(true);
  };

  const { data: medicines = [], isLoading: mLoading } = useQuery({
    queryKey: ["medicines"],
    queryFn: () => base44.entities.Medicine.list("-created_date", 200),
    enabled: role !== "receptionist",
  });

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => base44.entities.Prescription.list("-created_date", 200),
    enabled: role === "admin",
  });

  const loading = pLoading || aLoading || mLoading;

  const todayAppts = appointments.filter((a) => a.appointment_date === today);
  const myTodayAppts = todayAppts.filter((a) => a.doctor_id === currentUser?.id);
  const lowStock = medicines.filter((m) => m.quantity < 10);
  const scheduledAppts = appointments.filter((a) => a.status === "Scheduled");
  const isActiveAppointment = (status) => status === "Scheduled" || status === "Approved";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello ,  ${currentUser?.full_name || currentUser?.name || "User"}`}
      />

      {/* Admin Dashboard */}
      {role === "admin" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Patients" value={patients.length} icon={Users} color="cyan" />
            <StatCard title="Today's Appointments" value={todayAppts.length} icon={Calendar} color="teal" />
            <StatCard title="Low Stock Medicines" value={lowStock.length} icon={AlertTriangle} color={lowStock.length > 0 ? "rose" : "emerald"} />
            <StatCard title="Total Prescriptions" value={prescriptions.length} icon={DollarSign} color="violet" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Today's Appointments */}
            <div className="bg-white rounded-xl border border-slate-200/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Today's Appointments</h3>
                <Link to={createPageUrl("Appointments")}>
                  <Button variant="ghost" size="sm" className="text-cyan-600">View All <ArrowRight className="w-4 h-4 ml-1" /></Button>
                </Link>
              </div>
              {todayAppts.length === 0 ? (
                <p className="text-slate-400 text-sm py-8 text-center">No appointments today</p>
              ) : (
                <div className="space-y-3">
                  {todayAppts.slice(0, 5).map((apt) => (
                    <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{apt.patient_name}</p>
                        <p className="text-xs text-slate-400">Dr. {apt.doctor_name} · {apt.appointment_time}</p>
                      </div>
                      <Badge variant={isActiveAppointment(apt.status) ? "default" : apt.status === "Completed" ? "secondary" : "destructive"} className="text-xs">
                        {apt.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Low Stock */}
            <div className="bg-white rounded-xl border border-slate-200/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Low Stock Alert</h3>
                <Link to={createPageUrl("Dispensary")}>
                  <Button variant="ghost" size="sm" className="text-cyan-600">View All <ArrowRight className="w-4 h-4 ml-1" /></Button>
                </Link>
              </div>
              {lowStock.length === 0 ? (
                <p className="text-slate-400 text-sm py-8 text-center">All medicines well stocked</p>
              ) : (
                <div className="space-y-3">
                  {lowStock.slice(0, 5).map((med) => (
                    <div key={med.id} className="flex items-center justify-between p-3 rounded-lg bg-rose-50">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{med.name}</p>
                        <p className="text-xs text-slate-400">{med.type} · {med.supplier || "No supplier"}</p>
                      </div>
                      <Badge variant="destructive" className="text-xs">{med.quantity} left</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Receptionist Dashboard */}
      {role === "receptionist" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title="Total Patients" value={patients.length} icon={Users} color="cyan" />
            <StatCard title="Today's Appointments" value={todayAppts.length} icon={Calendar} color="teal" />
            <StatCard title="Scheduled" value={scheduledAppts.length} icon={Clock} color="violet" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Quick Actions</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Link to={createPageUrl("Patients") + "?action=new"}>
                  <div className="p-4 rounded-xl bg-cyan-50 hover:bg-cyan-100 transition-colors cursor-pointer text-center">
                    <UserPlus className="w-6 h-6 text-cyan-600 mx-auto mb-2" />
                    <p className="text-sm font-medium text-cyan-700">Register Patient</p>
                  </div>
                </Link>
                <Link to={createPageUrl("Appointments") + "?action=new"}>
                  <div className="p-4 rounded-xl bg-teal-50 hover:bg-teal-100 transition-colors cursor-pointer text-center">
                    <Calendar className="w-6 h-6 text-teal-600 mx-auto mb-2" />
                    <p className="text-sm font-medium text-teal-700">Schedule Appointment</p>
                  </div>
                </Link>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Today's Appointments</h3>
              </div>
              {todayAppts.length === 0 ? (
                <p className="text-slate-400 text-sm py-8 text-center">No appointments today</p>
              ) : (
                <div className="space-y-3">
                  {todayAppts.slice(0, 5).map((apt) => (
                    <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{apt.patient_name}</p>
                        <p className="text-xs text-slate-400">Dr. {apt.doctor_name} · {apt.appointment_time}</p>
                      </div>
                      <Badge variant={isActiveAppointment(apt.status) ? "default" : "secondary"} className="text-xs">{apt.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Doctor Dashboard */}
      {role === "doctor" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title="Today's Patients" value={myTodayAppts.length} icon={Users} color="cyan" />
            <StatCard title="Scheduled" value={myTodayAppts.filter((a) => a.status === "Scheduled").length} icon={Clock} color="teal" />
            <StatCard title="Completed" value={myTodayAppts.filter((a) => a.status === "Completed").length} icon={Stethoscope} color="emerald" />
          </div>

          <div className="bg-white rounded-xl border border-slate-200/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">My Today's Appointments</h3>
              <Link to={createPageUrl("Appointments")}>
                <Button variant="ghost" size="sm" className="text-cyan-600">View All <ArrowRight className="w-4 h-4 ml-1" /></Button>
              </Link>
            </div>
            {myTodayAppts.length === 0 ? (
              <p className="text-slate-400 text-sm py-8 text-center">No appointments scheduled for today</p>
            ) : (
              <div className="space-y-3">
                {myTodayAppts.map((apt) => (
                  <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-700 text-sm font-semibold">
                        {apt.patient_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">{apt.patient_name}</p>
                        <p className="text-xs text-slate-400">{apt.appointment_time} · {apt.reason || "General"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={isActiveAppointment(apt.status) ? "default" : "secondary"} className="text-xs">{apt.status}</Badge>
                      {isActiveAppointment(apt.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => handleAddRx(apt)}
                        >
                          Prescribe
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <PrescriptionFormModal
        open={rxModalOpen}
        onOpenChange={setRxModalOpen}
        appointment={selectedApt}
        prescription={null}
        currentUser={currentUser}
      />
    </div>
  );
}
