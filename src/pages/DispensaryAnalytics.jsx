import React, { useState, useMemo } from "react";
import { base44 } from "@/api/apiClient";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { format, subDays, isAfter, isBefore, addMonths } from "date-fns";
import {
  TrendingUp, Package, ShoppingCart, DollarSign, AlertTriangle,
  Download, Search, ArrowUpDown, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

const RANGES = [
  { label: "Last 7 Days", value: "7" },
  { label: "Last 30 Days", value: "30" },
  { label: "Last 90 Days", value: "90" },
  { label: "Custom", value: "custom" },
];

function StatCard({ title, value, icon, color, sub }) {
  const Icon = icon;
  return (
    <div className="bg-white rounded-xl border border-slate-200/60 p-5 flex items-start gap-4">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", color)}>
        {Icon && <Icon className="w-5 h-5 text-white" />}
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-slate-800 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DispensaryAnalytics({ currentUser }) {
  const [range, setRange] = useState("30");
  const [customDays, setCustomDays] = useState(60);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("revenue");

  const { data: billLines = [], isLoading: loadingLines } = useQuery({
    queryKey: ["bill-lines"],
    queryFn: () => base44.dispensary.salesBillLines(5000),
  });

  const { data: medicines = [], isLoading: loadingMeds } = useQuery({
    queryKey: ["medicines"],
    queryFn: () => base44.entities.Medicine.list("-created_date", 500),
  });

  const days = range === "custom" ? customDays : parseInt(range);
  const startDate = subDays(new Date(), days);

  const filteredLines = useMemo(() => {
    return billLines.filter((l) => l.bill_created_date && isAfter(new Date(l.bill_created_date), startDate));
  }, [billLines, startDate]);

  // Summary
  const totalSold = filteredLines.reduce((a, s) => a + (s.quantity || 0), 0);
  const totalRevenue = filteredLines.reduce((a, s) => a + (s.line_total || 0), 0);
  const totalTransactions = filteredLines.length;

  // Per-medicine aggregation
  const medMap = useMemo(() => {
    const map = {};
    const nameById = {};
    for (const m of medicines) nameById[m.id] = m.name;
    for (const s of filteredLines) {
      if (!map[s.medicine_id]) {
        map[s.medicine_id] = { name: nameById[s.medicine_id] || s.medicine_id, qty: 0, revenue: 0, transactions: 0 };
      }
      map[s.medicine_id].qty += s.quantity || 0;
      map[s.medicine_id].revenue += s.line_total || 0;
      map[s.medicine_id].transactions += 1;
    }
    return Object.values(map);
  }, [filteredLines, medicines]);

  const topMeds = useMemo(() => {
    let sorted = [...medMap];
    if (sortBy === "qty") sorted.sort((a, b) => b.qty - a.qty);
    else sorted.sort((a, b) => b.revenue - a.revenue);
    if (search) sorted = sorted.filter((m) => m.name?.toLowerCase().includes(search.toLowerCase()));
    return sorted.slice(0, 20);
  }, [medMap, sortBy, search]);

  const top10Chart = useMemo(() =>
    [...medMap].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((m) => ({
      name: m.name?.length > 12 ? m.name.slice(0, 12) + "…" : m.name,
      Revenue: parseFloat(m.revenue.toFixed(2)),
      Qty: m.qty,
    })),
    [medMap]
  );

  // Daily sales chart
  const dailyChart = useMemo(() => {
    const map = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "MMM d");
      map[d] = { date: d, Revenue: 0, Transactions: 0 };
    }
    for (const s of filteredLines) {
      const d = format(new Date(s.bill_created_date), "MMM d");
      if (map[d]) {
        map[d].Revenue += s.line_total || 0;
        map[d].Transactions += 1;
      }
    }
    return Object.values(map).map((v) => ({ ...v, Revenue: parseFloat(v.Revenue.toFixed(2)) }));
  }, [filteredLines, days]);

  // Stagnant medicines — sold 0 times in selected range
  const soldIds = new Set(filteredLines.map((s) => s.medicine_id));
  const stagnant = medicines.filter((m) => !soldIds.has(m.id));

  // Inventory insights
  const nearExpiry = medicines.filter((m) => m.expiry_date && isBefore(new Date(m.expiry_date), addMonths(new Date(), 3)) && isAfter(new Date(m.expiry_date), new Date()));
  const expired = medicines.filter((m) => m.expiry_date && isBefore(new Date(m.expiry_date), new Date()));
  const lowStock = medicines.filter((m) => Number(m.stock || 0) < 10);
  const excessStock = medicines.filter((m) => Number(m.stock || 0) > 200);

  const exportCSV = () => {
    const rows = [
      ["Medicine", "Quantity Sold", "Revenue (₹)", "Transactions"],
      ...medMap.map((m) => [m.name, m.qty, m.revenue.toFixed(2), m.transactions]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispensary-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Dispensary Sales Report", 14, 18);
    doc.setFontSize(10);
    doc.text(`Period: Last ${days} days  |  Generated: ${format(new Date(), "MMM d, yyyy")}`, 14, 26);
    doc.setFontSize(12);
    doc.text(`Total Revenue: ₹${totalRevenue.toFixed(2)}   |   Units Sold: ${totalSold}   |   Transactions: ${totalTransactions}`, 14, 36);
    doc.setFontSize(10);
    let y = 48;
    doc.text("Medicine", 14, y); doc.text("Qty", 100, y); doc.text("Revenue (₹)", 130, y); doc.text("Txns", 170, y);
    y += 6;
    doc.line(14, y, 196, y);
    y += 4;
    for (const m of medMap.sort((a, b) => b.revenue - a.revenue).slice(0, 40)) {
      if (y > 275) { doc.addPage(); y = 18; }
      doc.text(m.name?.slice(0, 40) || "", 14, y);
      doc.text(String(m.qty), 100, y);
      doc.text(m.revenue.toFixed(2), 130, y);
      doc.text(String(m.transactions), 170, y);
      y += 7;
    }
    doc.save(`dispensary-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const isLoading = loadingLines || loadingMeds;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Analytics"
        description="Dispensary performance and inventory insights"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCSV} className="gap-2 text-sm">
              <Download className="w-4 h-4" /> CSV
            </Button>
            <Button variant="outline" onClick={exportPDF} className="gap-2 text-sm">
              <Download className="w-4 h-4" /> PDF
            </Button>
          </div>
        }
      />

      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Last</span>
            <Input type="number" min={1} max={365} value={customDays} onChange={(e) => setCustomDays(parseInt(e.target.value) || 30)} className="w-20" />
            <span className="text-sm text-slate-500">days</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="Total Revenue" value={`₹${totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} icon={DollarSign} color="bg-emerald-500" sub={`Last ${days} days`} />
            <StatCard title="Units Sold" value={totalSold.toLocaleString()} icon={ShoppingCart} color="bg-cyan-500" sub="Total quantity" />
            <StatCard title="Transactions" value={totalTransactions} icon={TrendingUp} color="bg-violet-500" sub="Individual sales" />
          </div>

          {/* Daily revenue chart */}
          <div className="bg-white rounded-xl border border-slate-200/60 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Daily Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={Math.floor(days / 7)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`₹${v}`, "Revenue"]} />
                <Line type="monotone" dataKey="Revenue" stroke="#06b6d4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top 10 medicines chart */}
          <div className="bg-white rounded-xl border border-slate-200/60 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Top 10 Medicines by Revenue</h3>
            {top10Chart.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">No sales data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top10Chart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip formatter={(v) => [`₹${v}`, "Revenue"]} />
                  <Bar dataKey="Revenue" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Most selling medicines table */}
          <div className="bg-white rounded-xl border border-slate-200/60">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Medicine Sales Details</h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Search medicine..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-48 text-sm" />
                </div>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-36 text-sm">
                    <ArrowUpDown className="w-3 h-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">By Revenue</SelectItem>
                    <SelectItem value="qty">By Quantity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {topMeds.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-10">No sales in this period</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Qty Sold</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Transactions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topMeds.map((m, i) => (
                      <TableRow key={m.name} className="hover:bg-slate-50/50">
                        <TableCell className="text-slate-400 text-sm">{i + 1}</TableCell>
                        <TableCell className="font-medium text-sm text-slate-700">{m.name}</TableCell>
                        <TableCell className="text-sm text-slate-600">{m.qty}</TableCell>
                        <TableCell className="text-sm font-medium text-emerald-600">₹{m.revenue.toFixed(2)}</TableCell>
                        <TableCell className="text-sm text-slate-500">{m.transactions}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Stagnant medicines */}
          <div className="bg-white rounded-xl border border-slate-200/60">
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">
                Stagnant Medicines
                <Badge className="ml-2 bg-amber-100 text-amber-700 border-0">{stagnant.length}</Badge>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">No sales recorded in the selected period</p>
            </div>
            {stagnant.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">All medicines have had sales this period 🎉</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Current Stock</TableHead>
                      <TableHead>Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stagnant.map((m) => (
                      <TableRow key={m.id} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium text-sm text-slate-700">{m.name}</TableCell>
                        <TableCell className="text-sm text-slate-500">{m.category || "-"}</TableCell>
                        <TableCell className="text-sm text-slate-600">{m.stock || 0}</TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {m.expiry_date ? format(new Date(m.expiry_date), "MMM d, yyyy") : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Inventory Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Near expiry */}
            <div className="bg-white rounded-xl border border-slate-200/60">
              <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-700">Expiring Soon (&lt; 3 months)</h3>
                <Badge className="ml-auto bg-amber-100 text-amber-700 border-0">{nearExpiry.length}</Badge>
              </div>
              {nearExpiry.length === 0 ? (
                <p className="text-slate-400 text-xs text-center py-6">No medicines expiring soon</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {nearExpiry.map((m) => (
                    <div key={m.id} className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-sm text-slate-700">{m.name}</span>
                      <span className="text-xs text-amber-600 font-medium">{format(new Date(m.expiry_date), "MMM d, yyyy")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Low stock & Excess */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200/60">
                <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                  <Package className="w-4 h-4 text-red-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Low Stock (&lt; 10 units)</h3>
                  <Badge className="ml-auto bg-red-100 text-red-700 border-0">{lowStock.length}</Badge>
                </div>
                {lowStock.length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-4">All medicines adequately stocked</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {lowStock.slice(0, 5).map((m) => (
                      <div key={m.id} className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-sm text-slate-700">{m.name}</span>
                        <span className="text-xs text-red-600 font-medium">{m.stock || 0} left</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200/60">
                <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-700">Excess Stock (&gt; 200 units)</h3>
                  <Badge className="ml-auto bg-slate-100 text-slate-600 border-0">{excessStock.length}</Badge>
                </div>
                {excessStock.length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-4">No excess stock</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {excessStock.slice(0, 5).map((m) => (
                      <div key={m.id} className="px-4 py-2.5 flex items-center justify-between">
                        <span className="text-sm text-slate-700">{m.name}</span>
                        <span className="text-xs text-slate-500 font-medium">{m.stock || 0} units</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
