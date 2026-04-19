import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/apiClient";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

function dateOnly(value) {
  if (!value) return "";
  if (typeof value === "string") return value.split("T")[0];
  try {
    return format(new Date(value), "yyyy-MM-dd");
  } catch {
    return String(value);
  }
}

export default function GrnDetailModal({ open, onOpenChange, grnId }) {
  const { data, isLoading } = useQuery({
    queryKey: ["grn-detail", grnId],
    queryFn: () => (grnId ? base44.dispensary.grnGet(grnId) : Promise.resolve(null)),
    enabled: open && !!grnId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>GRN Details</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
          </div>
        ) : !data ? (
          <div className="text-sm text-slate-500 py-6">No data</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border">
              <div>
                <p className="text-xs text-slate-500">Bill Number</p>
                <p className="text-sm font-medium text-slate-700">{data.bill_number}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Supplier</p>
                <p className="text-sm text-slate-700">{data.supplier_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Bill Date</p>
                <p className="text-sm text-slate-700">{data.bill_date || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Created</p>
                <p className="text-sm text-slate-700">
                  {data.created_date ? format(new Date(data.created_date), "MMM d, yyyy HH:mm") : "—"}
                </p>
              </div>
              {data.notes && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500">Notes</p>
                  <p className="text-sm text-slate-700">{data.notes}</p>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">% Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.lines || []).map((L) => (
                    <TableRow key={L.id}>
                      <TableCell className="text-sm text-slate-700">{L.medicine_name || L.medicine_id}</TableCell>
                      <TableCell className="text-sm">{L.batch_number || "—"}</TableCell>
                      <TableCell className="text-sm">{L.expiry_date ? dateOnly(L.expiry_date) : "—"}</TableCell>
                      <TableCell className="text-sm text-right">₹{Number(L.mrp || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-right">₹{Number(L.sale_price || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-right">{L.quantity}</TableCell>
                      <TableCell className="text-sm text-right">{Number(L.tax_percent || 0)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
