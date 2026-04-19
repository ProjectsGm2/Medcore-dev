import React, { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/apiClient";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { resolveImageSrc } from "@/lib/utils";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

function shortId(id) {
  if (!id) return "-";
  const hex = String(id).replace(/-/g, "");
  let n = BigInt("0x" + hex);
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  if (n === 0n) return "0";
  let out = "";
  while (n > 0n) {
    out = alphabet[Number(n % 36n)] + out;
    n = n / 36n;
  }
  return out.slice(0, 8);
}

function dateOnly(value) {
  if (!value) return "";
  return String(value).split("T")[0];
}

function formatExpiry(value) {
  if (!value) return "";
  try {
    return format(new Date(value), "dd-MMM-yy");
  } catch {
    return dateOnly(value);
  }
}

function safeText(value) {
  return String(value || "").trim();
}

export default function BillDetailModal({ open, onOpenChange, billId, autoPrint = false }) {
  const { data, isLoading } = useQuery({
    queryKey: ["bill-detail", billId],
    queryFn: () => (billId ? base44.dispensary.salesBillGet(billId) : Promise.resolve(null)),
    enabled: open && !!billId,
  });

  const { data: settings = {} } = useQuery({
    queryKey: ["settings"],
    queryFn: () => base44.settings.all(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const handlePrint = () => {
    if (!data) return;
    const clinicName = safeText(settings.clinic_name) || "Clinic";
    const clinicAddress = safeText(settings.address);
    const clinicPhone = safeText(settings.phone);
    const clinicEmail = safeText(settings.email);
    const logoUrl = resolveImageSrc(settings.logo || settings.small_logo || "");
    const contactLine = [clinicPhone, clinicEmail].filter(Boolean).join(" | ");

    const created = data.created_date ? format(new Date(data.created_date), "dd-MMM-yy HH:mm") : "-";
    const billNo = shortId(data.id);
    const staff = safeText(data.generated_by_name) || "-";
    const doctor = safeText(data.doctor_name) || "-";
    const patient = safeText(data.patient_name) || "-";
    const payment = `${safeText(data.payment_mode) || "-"}${data.payment_amount != null ? ` · ₹${Number(data.payment_amount).toFixed(2)}` : ""}`;
    const notes = safeText(data.notes);

    const rows = (data.lines || [])
      .map((L) => {
        const item = escapeHtml(L.item_name || "-");
        const batch = escapeHtml(L.batch_number || "-");
        const exp = escapeHtml(L.expiry_date ? formatExpiry(L.expiry_date) : "-");
        const price = `₹${Number(L.sale_price || 0).toFixed(2)}`;
        const qty = escapeHtml(L.quantity ?? "-");
        const tax = `${Number(L.tax_percent || 0)}%`;
        const total = `₹${Number(L.line_total || 0).toFixed(2)}`;
        return `
          <tr>
            <td class="left">${item}</td>
            <td class="left">${batch}</td>
            <td class="left">${exp}</td>
            <td class="right mono">${escapeHtml(price)}</td>
            <td class="right mono">${qty}</td>
            <td class="right mono">${escapeHtml(tax)}</td>
            <td class="right mono">${escapeHtml(total)}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <html>
        <head>
          <title>Bill - ${escapeHtml(billNo)}</title>
          <style>
            * { box-sizing: border-box; }
            @page { margin: 14mm; }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #0f172a; background: #fff; }
            .sheet { width: 100%; }
            .header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #0891b2; padding: 0 0 12px; margin: 0 0 12px; }
            .logo { width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; }
            .logo img { max-width: 70px; max-height: 70px; object-fit: contain; }
            .clinic { flex: 1; min-width: 0; }
            .clinic h1 { margin: 0; font-size: 22px; color: #0f766e; line-height: 1.2; }
            .clinic .sub { margin-top: 4px; font-size: 12px; color: #475569; line-height: 1.35; }
            .meta { text-align: right; min-width: 160px; }
            .meta .title { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
            .meta .value { font-size: 14px; font-weight: 700; margin-top: 2px; }
            .meta .date { font-size: 12px; color: #475569; margin-top: 4px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin: 12px 0; }
            .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; }
            .row { display: flex; gap: 8px; font-size: 12.5px; line-height: 1.45; }
            .label { width: 88px; color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em; }
            .val { flex: 1; color: #0f172a; font-weight: 600; }
            .notes { margin-top: 8px; font-size: 12px; color: #0f172a; white-space: pre-wrap; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #f0f9ff; border: 1px solid #dbeafe; padding: 8px; text-align: left; font-size: 10px; color: #0369a1; text-transform: uppercase; letter-spacing: 0.06em; }
            td { border: 1px solid #e2e8f0; padding: 8px; font-size: 12px; vertical-align: top; }
            .right { text-align: right; }
            .left { text-align: left; }
            .mono { font-variant-numeric: tabular-nums; }
            tr { page-break-inside: avoid; }
            .totals { margin-top: 12px; display: flex; justify-content: flex-end; }
            .totals table { width: 320px; margin: 0; }
            .totals td { border: 0; padding: 4px 0; }
            .totals .k { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
            .totals .v { text-align: right; font-weight: 700; }
            .totals .net { font-size: 14px; color: #0f766e; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="header">
              <div class="logo">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(clinicName)}" />` : ""}</div>
              <div class="clinic">
                <h1>${escapeHtml(clinicName)}</h1>
                <div class="sub">
                  ${clinicAddress ? `<div>${escapeHtml(clinicAddress)}</div>` : ""}
                  ${contactLine ? `<div>${escapeHtml(contactLine)}</div>` : ""}
                </div>
              </div>
              <div class="meta">
                <div class="title">Bill</div>
                <div class="value">${escapeHtml(billNo)}</div>
                <div class="date">${escapeHtml(created)}</div>
              </div>
            </div>

            <div class="grid">
              <div class="card">
                <div class="row"><div class="label">Patient</div><div class="val">${escapeHtml(patient)}</div></div>
                <div class="row"><div class="label">Doctor</div><div class="val">${escapeHtml(doctor)}</div></div>
                <div class="row"><div class="label">Staff</div><div class="val">${escapeHtml(staff)}</div></div>
              </div>
              <div class="card">
                <div class="row"><div class="label">Payment</div><div class="val">${escapeHtml(payment)}</div></div>
                <div class="row"><div class="label">Subtotal</div><div class="val mono">₹${Number(data.subtotal || 0).toFixed(2)}</div></div>
                <div class="row"><div class="label">Tax</div><div class="val mono">₹${Number(data.tax_total || 0).toFixed(2)}</div></div>
              </div>
            </div>

            ${notes ? `<div class="card"><div class="row"><div class="label">Notes</div><div class="val">${escapeHtml(notes)}</div></div></div>` : ""}

            <table>
              <thead>
                <tr>
                  <th style="width: 34%;">Item</th>
                  <th style="width: 15%;">Batch</th>
                  <th style="width: 12%;">Expiry</th>
                  <th style="width: 11%;" class="right">Price</th>
                  <th style="width: 8%;" class="right">Qty</th>
                  <th style="width: 8%;" class="right">Tax</th>
                  <th style="width: 12%;" class="right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>

            <div class="totals">
              <table>
                <tr><td class="k">Gross</td><td class="v mono">₹${Number(data.gross_total || 0).toFixed(2)}</td></tr>
                <tr><td class="k">Discount</td><td class="v mono">₹${Number(data.discount_total || 0).toFixed(2)}</td></tr>
                <tr><td class="k net">Net</td><td class="v mono net">₹${Number(data.net_total || 0).toFixed(2)}</td></tr>
              </table>
            </div>
          </div>
          <script>
            window.onload = function () {
              window.focus();
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `;

    const printWin = window.open("", "_blank");
    if (!printWin) {
      window.print();
      return;
    }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  };

  const printedRef = useRef(false);
  useEffect(() => {
    if (!open) printedRef.current = false;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (!autoPrint) return;
    if (printedRef.current) return;
    if (!data || isLoading) return;
    printedRef.current = true;
    window.print();
  }, [open, autoPrint, data, isLoading]);

  const clinicName = safeText(settings.clinic_name) || "Clinic";
  const clinicAddress = safeText(settings.address);
  const clinicPhone = safeText(settings.phone);
  const clinicEmail = safeText(settings.email);
  const logoUrl = resolveImageSrc(settings.logo || settings.small_logo || "");
  const contactLine = [clinicPhone, clinicEmail].filter(Boolean).join(" | ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bill</DialogTitle>
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
                <p className="text-xs text-slate-500">Bill #</p>
                <p className="text-sm font-medium text-slate-700">{shortId(data.id)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Created</p>
                <p className="text-sm text-slate-700">
                  {data.created_date ? format(new Date(data.created_date), "MMM d, yyyy HH:mm") : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Attendee</p>
                <p className="text-sm text-slate-700">{data.attendee_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Staff</p>
                <p className="text-sm text-slate-700">{data.generated_by_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Doctor</p>
                <p className="text-sm text-slate-700">{data.doctor_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Patient</p>
                <p className="text-sm text-slate-700">{data.patient_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Payment</p>
                <p className="text-sm text-slate-700">{data.payment_mode || "—"}{data.payment_amount != null ? ` · ₹${Number(data.payment_amount).toFixed(2)}` : ""}</p>
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
                    <TableHead>Item</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">% Tax</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.lines || []).map((L) => (
                    <TableRow key={L.id}>
                      <TableCell className="text-sm text-slate-700">{L.item_name || "—"}</TableCell>
                      <TableCell className="text-sm">{L.batch_number || "—"}</TableCell>
                      <TableCell className="text-sm">{L.expiry_date ? formatExpiry(L.expiry_date) : "—"}</TableCell>
                      <TableCell className="text-sm text-right">₹{Number(L.sale_price || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-right">{L.quantity}</TableCell>
                      <TableCell className="text-sm text-right">{Number(L.tax_percent || 0)}%</TableCell>
                      <TableCell className="text-sm text-right">₹{Number(L.line_total || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border">
              <div>
                <p className="text-xs text-slate-500">Subtotal</p>
                <p className="text-sm text-slate-700">₹{Number(data.subtotal || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Tax</p>
                <p className="text-sm text-slate-700">₹{Number(data.tax_total || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Discount</p>
                <p className="text-sm text-slate-700">₹{Number(data.discount_total || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Gross</p>
                <p className="text-sm text-slate-700">₹{Number(data.gross_total || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Net</p>
                <p className="text-sm text-slate-700">₹{Number(data.net_total || 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1">
                <Printer className="w-4 h-4" /> Print
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
