import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Trash2 } from "lucide-react";
import api, { errMsg, money } from "@/lib/api";
import { DataTable, PageHeader, StatCard } from "@/components/Shell";
import { downloadLedgerPdf } from "@/lib/pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const blank = { date: new Date().toISOString().slice(0, 10), particulars: "", debit: "", credit: "", payment_mode: "cash" };

const Ledger = () => {
  const [farmers, setFarmers] = useState([]);
  const [farmerId, setFarmerId] = useState("");
  const [data, setData] = useState(null);
  const [company, setCompany] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  useEffect(() => {
    api.get("/farmers").then(({ data }) => setFarmers(data)).catch(() => {});
    api.get("/company-profile").then(({ data }) => setCompany(data)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!farmerId) {
      setData(null);
      return;
    }
    api
      .get("/ledger", { params: { farmer_id: farmerId } })
      .then(({ data }) => setData(data))
      .catch((e) => toast.error(errMsg(e)));
  }, [farmerId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    try {
      await api.post("/ledger", { ...form, farmer_id: farmerId });
      toast.success("Ledger entry added");
      setOpen(false);
      setForm(blank);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const remove = async (row) => {
    try {
      await api.delete(`/ledger/${row.id}`);
      toast.success("Entry deleted");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const farmerName = farmers.find((f) => f.id === farmerId)?.name || "";

  return (
    <div data-testid="ledger-page">
      <PageHeader
        title="Farmer Ledger"
        subtitle="Running account of every farmer — sales are debits, potato purchases and credit notes are credits."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!data}
              data-testid="ledger-pdf-btn"
              className="gap-2"
              onClick={() =>
                downloadLedgerPdf({ farmerName, entries: data.entries, totals: data.totals, company })
              }
            >
              <Download className="h-4 w-4" /> PDF
            </Button>
            <Button disabled={!farmerId} data-testid="ledger-add-btn" className="gap-2" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Add Entry
            </Button>
          </div>
        }
      />

      <div className="mb-6 max-w-sm">
        <Label className="text-xs">Select Farmer</Label>
        <Select value={farmerId} onValueChange={setFarmerId}>
          <SelectTrigger data-testid="ledger-farmer-select" className="mt-1 bg-white">
            <SelectValue placeholder="Choose a farmer" />
          </SelectTrigger>
          <SelectContent className="bg-white">
            {farmers.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name} {f.village ? `(${f.village})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard testid="ledger-debit" label="Total Debit" value={money(data.totals.debit)} />
          <StatCard testid="ledger-credit" label="Total Credit" value={money(data.totals.credit)} />
          <StatCard
            testid="ledger-balance"
            label="Closing Balance"
            value={money(data.totals.balance)}
            sub={data.totals.balance >= 0 ? "Receivable from farmer" : "Payable to farmer"}
          />
        </div>
      )}

      <DataTable
        testid="ledger"
        loading={false}
        rows={data?.entries || []}
        columns={[
          { key: "date", label: "Date" },
          { key: "particulars", label: "Particulars" },
          { key: "ref_type", label: "Source" },
          { key: "debit", label: "Debit", align: "right", render: (r) => money(r.debit) },
          { key: "credit", label: "Credit", align: "right", render: (r) => money(r.credit) },
          { key: "balance", label: "Balance", align: "right", render: (r) => money(r.balance) },
        ]}
        actions={(row) =>
          (row.ref_type || "manual") === "manual" ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              data-testid={`ledger-delete-${row.id}`}
              onClick={() => remove(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">auto</span>
          )
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="font-head">Add Ledger Entry — {farmerName}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                data-testid="ledger-field-date"
                type="date"
                className="mt-1"
                value={form.date}
                onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Payment Mode</Label>
              <Select value={form.payment_mode} onValueChange={(v) => setForm((s) => ({ ...s, payment_mode: v }))}>
                <SelectTrigger data-testid="ledger-field-mode" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Particulars</Label>
              <Input
                data-testid="ledger-field-particulars"
                className="mt-1"
                value={form.particulars}
                onChange={(e) => setForm((s) => ({ ...s, particulars: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Debit (farmer owes)</Label>
              <Input
                data-testid="ledger-field-debit"
                type="number"
                className="mt-1"
                value={form.debit}
                onChange={(e) => setForm((s) => ({ ...s, debit: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Credit (paid / adjusted)</Label>
              <Input
                data-testid="ledger-field-credit"
                type="number"
                className="mt-1"
                value={form.credit}
                onChange={(e) => setForm((s) => ({ ...s, credit: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="ledger-cancel-btn">
              Cancel
            </Button>
            <Button onClick={save} data-testid="ledger-save-btn">
              Save Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Ledger;
