import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Mail, MessageCircle, Plus, Trash2 } from "lucide-react";
import api, { errMsg, money } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { DataTable, PageHeader, StatCard } from "@/components/Shell";
import { downloadLedgerPdf } from "@/lib/pdf";
import { downloadExcel, mapRows } from "@/lib/excel";
import { roleLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const blank = {
  date: new Date().toISOString().slice(0, 10),
  particulars: "",
  debit: "",
  credit: "",
  payment_mode: "cash",
};

const Ledger = () => {
  const { perms, isAdmin } = useAuth();
  const lp = isAdmin ? ["view", "create", "edit", "delete"] : perms?.ledger || [];
  const [parties, setParties] = useState([]);
  const [partyId, setPartyId] = useState("");
  const [data, setData] = useState(null);
  const [company, setCompany] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get("/parties").then(({ data }) => setParties(data)).catch(() => {});
    api.get("/company-profile").then(({ data }) => setCompany(data)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!partyId) {
      setData(null);
      return;
    }
    api
      .get("/ledger", { params: { party_id: partyId } })
      .then(({ data }) => setData(data))
      .catch((e) => toast.error(errMsg(e)));
  }, [partyId]);

  useEffect(() => {
    load();
  }, [load]);

  const party = parties.find((p) => p.id === partyId);
  const partyName = party?.name || "";

  const save = async () => {
    try {
      await api.post("/ledger", { ...form, party_id: partyId });
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

  const shareWhatsapp = () => {
    const t = data.totals;
    const text = [
      `${company?.name || "Potato ERP"} — Account statement`,
      `Party: ${partyName}`,
      `Total debit: ${t.debit}`,
      `Total credit: ${t.credit}`,
      `Closing balance: ${t.balance}`,
      `Entries: ${data.entries.length}`,
    ].join("\n");
    const phone = String(party?.phone || "").replace(/\D/g, "");
    const url = phone
      ? `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener");
  };

  const emailStatement = async () => {
    setSending(true);
    try {
      const { data: res } = await api.post(`/ledger/${partyId}/email-statement`);
      toast.success(`Statement emailed to ${res.sent_to}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-testid="ledger-page">
      <PageHeader
        title="Party Ledger"
        subtitle="One running account per party — sales and payments out are debits, purchases, receipts and credit notes are credits."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!data}
              data-testid="ledger-whatsapp-btn"
              className="gap-2"
              onClick={shareWhatsapp}
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            <Button
              variant="outline"
              disabled={!data || sending}
              data-testid="ledger-email-btn"
              className="gap-2"
              onClick={emailStatement}
            >
              <Mail className="h-4 w-4" /> {sending ? "Sending..." : "Email"}
            </Button>
            <Button
              variant="outline"
              disabled={!data}
              data-testid="ledger-excel-btn"
              className="gap-2"
              onClick={() =>
                downloadExcel({
                  filename: `ledger-${partyName || "party"}`,
                  sheets: [
                    {
                      name: "Ledger",
                      rows: mapRows(data.entries, [
                        { label: "Date", value: (r) => r.date },
                        { label: "Particulars", value: (r) => r.particulars },
                        { label: "Source", value: (r) => r.ref_type },
                        { label: "Debit", value: (r) => r.debit },
                        { label: "Credit", value: (r) => r.credit },
                        { label: "Balance", value: (r) => r.balance },
                      ]),
                    },
                    { name: "Totals", rows: [data.totals] },
                  ],
                })
              }
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              disabled={!data}
              data-testid="ledger-pdf-btn"
              className="gap-2"
              onClick={() =>
                downloadLedgerPdf({ farmerName: partyName, entries: data.entries, totals: data.totals, company })
              }
            >
              <Download className="h-4 w-4" /> PDF
            </Button>
            {lp.includes("create") && (
              <Button disabled={!partyId} data-testid="ledger-add-btn" className="gap-2" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Add Entry
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-6 max-w-sm">
        <Label className="text-xs">Select Party</Label>
        <Select value={partyId} onValueChange={setPartyId}>
          <SelectTrigger data-testid="ledger-party-select" className="mt-1 bg-white">
            <SelectValue placeholder="Choose a party" />
          </SelectTrigger>
          <SelectContent className="bg-white">
            {parties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} {p.roles?.length ? `· ${p.roles.map(roleLabel).join(", ")}` : ""}
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
            sub={data.totals.balance >= 0 ? "Receivable from party" : "Payable to party"}
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
          lp.includes("delete") && (row.ref_type || "manual") === "manual" ? (
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
            <DialogTitle className="font-head">Add Ledger Entry — {partyName}</DialogTitle>
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
              <Label className="text-xs">Debit (party owes)</Label>
              <Input
                data-testid="ledger-field-debit"
                type="number"
                className="mt-1"
                value={form.debit}
                onChange={(e) => setForm((s) => ({ ...s, debit: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Credit (you owe / received)</Label>
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
