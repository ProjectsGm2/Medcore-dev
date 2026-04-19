import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Pill,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Activity,
  UserCog,
  LogOut,
  X,
  Sparkles,
  Settings as SettingsIcon,
  Database,
  Mail,
  Shield,
  User
} from "lucide-react";
import { cn, resolveImageSrc } from "@/lib/utils";
import { useAuth, usePermission } from "@/lib/AuthContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

const navItems = {
  admin: [
    { label: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
    { label: "Patients", icon: Users, page: "Patients", module: "Patients" },
    { label: "Appointments", icon: Calendar, page: "Appointments", module: "Appointments" },
    { label: "OPD", icon: FileText, page: "OPD", module: "OPD" },
    { label: "Dispensary", icon: Pill, page: "Dispensary", module: "Dispensary" },
    { label: "Bills", icon: FileText, page: "Bills", module: "Dispensary" },
    { label: "AI Diagnosis", icon: Sparkles, page: "AIDiagnosis" },
    { label: "Staff", icon: UserCog, page: "Staff", module: "Staff" },
    { label: "Master", icon: Database, page: "Master", module: "Master" },
    {
      label: "Setup",
      icon: SettingsIcon,
      children: [
        { label: "Settings", icon: SettingsIcon, page: "Settings", module: "Settings" },
        { label: "Import / Export", icon: Database, page: "ImportExport", module: "ImportExport" },
      ],
    },
  ],
  receptionist: [
    { label: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
    { label: "Patients", icon: Users, page: "Patients", module: "Patients" },
    { label: "Appointments", icon: Calendar, page: "Appointments", module: "Appointments" },
  ],
  doctor: [
    { label: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
    { label: "OPD", icon: FileText, page: "OPD", module: "OPD" },
    { label: "My Appointments", icon: Calendar, page: "Appointments", module: "Appointments" },
    { label: "Dispensary", icon: Pill, page: "Dispensary", module: "Dispensary" },
    { label: "Bills", icon: FileText, page: "Bills", module: "Dispensary" },
    { label: "AI Diagnosis", icon: Sparkles, page: "AIDiagnosis" },
  ],
};

export default function Sidebar({ user, branding = {}, currentPage, collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const role = user?.role || "doctor";
  const items = navItems[role] || navItems.doctor;
  const { logout } = useAuth();
  const { can } = usePermission();
  const [openMenus, setOpenMenus] = React.useState({});
  const clinicName = String(branding?.clinic_name || "").trim() || "Clinic";
  const logoUrl = resolveImageSrc(branding?.small_logo || branding?.logo || "");

  const toggleMenu = (label) => {
    setOpenMenus((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const handleLogout = () => {
    setMobileOpen(false);
    logout();
  };

  const filterItem = (item) => {
    if (item.module && !can(item.module, 'view')) return null;
    
    if (item.children) {
      const filteredChildren = item.children
        .map(filterItem)
        .filter(Boolean);
      
      if (filteredChildren.length === 0) return null;
      return { ...item, children: filteredChildren };
    }
    
    return item;
  };

  const filteredItems = items
    .map(filterItem)
    .filter(Boolean);

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 h-full bg-white border-r border-slate-200 z-50 flex flex-col transition-all duration-300",
          collapsed ? "w-[68px]" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-100 shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt={clinicName} className="w-8 h-8 rounded-lg object-contain shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-white" />
            </div>
          )}
          {!collapsed && <span className="font-semibold text-slate-800 text-lg tracking-tight truncate">{clinicName}</span>}
          <button
            onClick={() => { setMobileOpen(false); setCollapsed(!collapsed); }}
            className="ml-auto p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hidden md:flex"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto p-1.5 rounded-md hover:bg-slate-100 text-slate-400 md:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {filteredItems.map((item) => {
            if (item.children) {
              const isSubActive = item.children.some(child => currentPage === child.page);
              const isOpen = openMenus[item.label] || isSubActive;
              
              return (
                <div key={item.label} className="space-y-1">
                  <button
                    onClick={() => toggleMenu(item.label)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                      isSubActive && "text-cyan-700 bg-cyan-50/50"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 shrink-0", isSubActive ? "text-cyan-600" : "text-slate-400")} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
                      </>
                    )}
                  </button>
                  {isOpen && !collapsed && (
                    <div className="pl-4 space-y-1">
                      {item.children.map((child) => {
                        const isChildActive = currentPage === child.page;
                        return (
                          <Link
                            key={child.page}
                            to={createPageUrl(child.page)}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                              isChildActive
                                ? "bg-cyan-50 text-cyan-700"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            )}
                          >
                            <child.icon className={cn("w-4 h-4 shrink-0", isChildActive ? "text-cyan-600" : "text-slate-400")} />
                            <span>{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = currentPage === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-cyan-50 text-cyan-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                )}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-cyan-600" : "text-slate-400")} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-slate-100 p-3 shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-3 w-full p-2 rounded-xl transition-all hover:bg-slate-50",
                  collapsed && "justify-center"
                )}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-xs font-semibold shrink-0 shadow-sm">
                  {user?.full_name?.[0]?.toUpperCase() || "U"}
                </div>
                {!collapsed && (
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-slate-700 truncate">{user?.full_name}</p>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{role}</p>
                  </div>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="end" className="w-72 p-0 ml-2 shadow-xl border-slate-200 overflow-hidden">
              <div className="p-4 bg-gradient-to-br from-slate-50 to-white">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white text-xl font-bold shadow-md">
                    {user?.full_name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-800 text-base truncate">{user?.full_name}</h4>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 uppercase tracking-tighter border border-cyan-100/50">
                      {role}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-slate-500 group">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-cyan-50 group-hover:text-cyan-600 transition-colors">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Email Address</p>
                      <p className="text-xs font-medium text-slate-700 truncate">{user?.email || "No email"}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 text-slate-500 group">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-cyan-50 group-hover:text-cyan-600 transition-colors">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Staff Role</p>
                      <p className="text-xs font-medium text-slate-700 truncate">{user?.role || "No role"}</p>
                    </div>
                  </div>

                  {user?.id && (
                    <div className="flex items-center gap-3 text-slate-500 group">
                      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-cyan-50 group-hover:text-cyan-600 transition-colors">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Employee ID</p>
                        <p className="text-xs font-mono font-medium text-slate-700 truncate">{user?.id.slice(0, 8)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <Separator className="bg-slate-100" />
              
              <div className="p-2 bg-slate-50/50">
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-100/50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <span>Logout from System</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </aside>
    </>
  );
}
