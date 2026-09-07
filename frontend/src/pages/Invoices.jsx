import { useEffect, useMemo, useState } from "react";
import { Download, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import api, { errMsg, money } from "@/lib/api";
import { DataTable, PageHeader } from "@/components/Shell";
import { FormField, errorClass } from "@/components/FormField";
import { validateForm } from "@/lib/validate";
import { downloadInvoicePdf } from "@/lib/pdf";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const Invoices = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("all");
  const [refs, setRefs] = useState({ parties: [], products: [], godowns: [], categories: [] });
  const [company, setCompany] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", date: "", payment_mode: "cash", cheque_no: "" });
  const [payErrors, setPayErrors] = useState({});
  const setPay = (k, v) => {
    setPayForm((s) => ({ ...s, [k]: v }));
    setPayErrors((s) => ({ ...s, [k]: "" }));
  };
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    Promise.all([
      api.get("/parties"),
      api.get("/products"),
      api.get("/godowns"),
      api.get("/product-categories"),
      api.get("/company-profile"),
    ])
      .then(([p, pr, g, c, cp]) => {
        setRefs({ parties: p.data, products: pr.data, godowns: g.data, categories: c.data });
        setCompany(cp.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .get("/invoices", { params: kind === "all" ? {} : { kind } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [kind, refreshKey]);

  const nameFrom = (list, id) => list.find((x) => x.id === id)?.name || "-";
  const partyName = (r) => nameFrom(refs.parties, r.party_id);
  const productName = (r) => nameFrom(refs.products, r.product_id);
  const godownName = (r) => nameFrom(refs.godowns, r.godown_id);

  const totals = useMemo(
    () => rows.reduce((s, r) => s + Number(r.total_amount ?? r.amount ?? 0), 0),
    [rows]
  );

  const openPayment = (row) => {
    setPayFor(row);
    setPayErrors({});
    setPayForm({
      amount: String(row.balance_amount ?? ""),
      date: new Date().toISOString().slice(0, 10),
      payment_mode: "cash",
      cheque_no: "",
    });
  };

  const savePayment = async () => {
    const errs = validateForm(
      [
        { name: "amount", label: "Amount", required: true, rule: "positive" },
        { name: "date", label: "Date", required: true, rule: "notFuture" },
      ],
      payForm
    );
    if (!errs.amount && Number(payForm.amount) > Number(payFor?.balance_amount || 0))
      errs.amount = `Cannot exceed the outstanding ${money(payFor?.balance_amount)}`;
    if (payForm.payment_mode === "cheque" && !payForm.cheque_no.trim())
      errs.cheque_no = "Cheque number is required for cheque payments";
    setPayErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      const endpoint = payFor.doc_type === "sale" ? "sales" : "purchases";
      const { data } = await api.post(`/${endpoint}/${payFor.id}/payments`, payForm);
      toast.success(`Payment recorded. Balance ${money(data.balance)}`);
      setPayFor(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="invoices-page">
      <PageHeader
        title="Invoices & Vouchers"
        subtitle="Every sale invoice and purchase voucher with payment tracking and PDF download."
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="w-56">
          <Label className="text-xs">Document Type</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger data-testid="invoices-kind-filter" className="mt-1 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="all">All Documents</SelectItem>
              <SelectItem value="sale">Sale Invoices</SelectItem>
              <SelectItem value="purchase">Purchase Vouchers</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          {rows.length} documents · Total {money(totals)}
        </p>
      </div>

      <DataTable
        testid="invoices"
        loading={loading}
        rows={rows}
        columns={[
          { key: "invoice_no", label: "No." },
          { key: "date", label: "Date" },
          {
            key: "doc_type",
            label: "Type",
            render: (r) => (
              <Badge
                className={`rounded-full ${
                  r.doc_type === "sale"
                    ? "bg-primary/10 text-primary hover:bg-primary/10"
                    : "bg-secondary/15 text-secondary hover:bg-secondary/15"
                }`}
              >
                {r.doc_type === "sale" ? "Sale Invoice" : "Purchase Voucher"}
              </Badge>
            ),
          },
          { key: "category_id", label: "Category", render: (r) => nameFrom(refs.categories, r.category_id) },
          { key: "party", label: "Party", render: (r) => partyName(r) },
          { key: "product", label: "Product", render: (r) => productName(r) },
          { key: "bags", label: "Bags", align: "right" },
          { key: "total_amount", label: "Total", align: "right", render: (r) => money(r.total_amount ?? r.amount) },
          { key: "paid_amount", label: "Paid", align: "right", render: (r) => money(r.paid_amount) },
          { key: "balance_amount", label: "Balance", align: "right", render: (r) => money(r.balance_amount) },
          {
            key: "payment_status",
            label: "Status",
            render: (r) => (
              <Badge
                className={`rounded-full ${
                  r.payment_status === "paid"
                    ? "bg-primary/10 text-primary hover:bg-primary/10"
                    : r.payment_status === "partial"
                      ? "bg-accent/25 text-accent-foreground hover:bg-accent/25"
                      : "bg-destructive/10 text-destructive hover:bg-destructive/10"
                }`}
              >
                {r.payment_status === "paid" ? "Paid" : r.payment_status === "partial" ? "Partial" : "Unpaid"}
              </Badge>
            ),
          },
        ]}
        actions={(row) => (
          <div className="flex justify-end gap-1">
            {row.balance_amount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                data-testid={`invoice-pay-${row.id}`}
                onClick={() => openPayment(row)}
              >
                <IndianRupee className="h-3.5 w-3.5" /> Payment
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              data-testid={`invoice-pdf-${row.id}`}
              onClick={() =>
                downloadInvoicePdf({
                  doc: row,
                  company,
                  partyName: partyName(row),
                  productName: productName(row),
                  godownName: godownName(row),
                })
              }
            >
              <Download className="h-3.5 w-3.5" /> PDF
            </Button>
          </div>
        )}
      />

      <Dialog open={!!payFor} onOpenChange={() => setPayFor(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-head">Record payment · {payFor?.invoice_no}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Total {money(payFor?.total_amount ?? payFor?.amount)} · already{" "}
            {payFor?.doc_type === "sale" ? "received" : "paid"} {money(payFor?.paid_amount)} · outstanding{" "}
            {money(payFor?.balance_amount)}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount" required error={payErrors.amount} testid="invoice-pay-amount">
              <Input
                data-testid="invoice-pay-amount"
                type="number"
                min={0}
                className={errorClass(payErrors.amount)}
                value={payForm.amount}
                onChange={(e) => setPay("amount", e.target.value)}
              />
            </FormField>
            <FormField label="Date" required error={payErrors.date} testid="invoice-pay-date">
              <Input
                data-testid="invoice-pay-date"
                type="date"
                className={errorClass(payErrors.date)}
                value={payForm.date}
                onChange={(e) => setPay("date", e.target.value)}
              />
            </FormField>
            <FormField label="Payment Mode" required testid="invoice-pay-mode">
              <Select value={payForm.payment_mode} onValueChange={(v) => setPay("payment_mode", v)}>
                <SelectTrigger data-testid="invoice-pay-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Cheque / Ref No."
              required={payForm.payment_mode === "cheque"}
              error={payErrors.cheque_no}
              testid="invoice-pay-ref"
            >
              <Input
                data-testid="invoice-pay-ref"
                className={errorClass(payErrors.cheque_no)}
                value={payForm.cheque_no}
                onChange={(e) => setPay("cheque_no", e.target.value)}
              />
            </FormField>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPayFor(null)} data-testid="invoice-pay-cancel">
              Cancel
            </Button>
            <Button onClick={savePayment} disabled={saving} data-testid="invoice-pay-save">
              {saving ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Invoices;
