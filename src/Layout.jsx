import React, { useState } from "react";
import Sidebar from "./components/layout/Sidebar";
import AIAssistantFAB from "./components/ai/AIAssistantFAB";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/apiClient";
import { useQuery } from "@tanstack/react-query";
import { cn, resolveImageSrc } from "@/lib/utils";
import { Menu, Loader2 } from "lucide-react";

export default function Layout({ children, currentPageName }) {
  const { user, isLoadingAuth } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: settings = {} } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.settings.all(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const clinicName = String(settings.clinic_name || "").trim() || "Clinic";
  const logoUrl = resolveImageSrc(settings.small_logo || settings.logo || "");

  if (isLoadingAuth) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-600 mx-auto" />
          <p className="mt-3 text-slate-500 text-sm">Loading {clinicName}...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        user={user}
        branding={settings}
        currentPage={currentPageName}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <div className={cn("transition-all duration-300", collapsed ? "md:ml-[68px]" : "md:ml-64")}>
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-slate-200 sticky top-0 z-30">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-md hover:bg-slate-100">
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
          {logoUrl ? (
            <img src={logoUrl} alt={clinicName} className="h-8 w-8 rounded-md object-contain" />
          ) : null}
          <span className="font-semibold text-slate-800 truncate">{clinicName}</span>
        </div>

        <main className="p-4 md:p-6 lg:p-8 transition-page">
          {React.cloneElement(children, { currentUser: user })}
        </main>
      </div>

      {/* Global AI Diagnosis FAB */}
      <AIAssistantFAB currentUser={user} />
    </div>
  );
}
