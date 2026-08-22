import { useEffect, useState } from "react";
import api, { money } from "@/lib/api";
import CrudPage from "@/components/CrudPage";
import { DataTable, StatCard } from "@/components/Shell";
import { PAYMENT_MODES, roleLabel } from "@/lib/constants";
import { nameOf } from "@/components/Shell";
import { Badge } from "@/components/ui/badge";

const Receipts = () => {
  const [out, setOut] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api.get("/outstanding").then(({ data }) => setOut(data)).catch(() => {});
  }, [tick]);

  return (
    <div data-testid="receipts-page">
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          testid="outstanding-receivable"
          label="Total Receivable"
          value={money(out?.totals?.receivable)}
          sub="Parties who owe you"
        />
        <StatCard
          testid="outstanding-payable"
          label="Total Payable"
          value={money(out?.totals?.payable)}
          sub="What you owe parties"
        />
        <StatCard testid="outstanding-net" label="Net Position" value={money(out?.totals?.net)} />
      </div>

      <CrudPage
        testid="receipts"
        title="Payment Receipt"
        subtitle="Money received from or paid out to any party. Every entry posts to that party's ledger."
        endpoint="receipts"
        soft={false}
        onChanged={() => setTick((t) => t + 1)}
        searchKeys={["receipt_no", "against_invoice", "notes"]}
        filters={[{ name: "party_id", label: "Party", allLabel: "All Parties", optionsFrom: "parties" }]}
        fields={[
          { name: "date", label: "Date", type: "date" },
          {
            name: "direction",
            label: "Direction",
            type: "select",
            options: [
              { value: "received", label: "Received (money in)" },
              { value: "paid", label: "Paid out (money out)" },
            ],
            default: "received",
          },
          { name: "party_id", label: "Party", type: "select", optionsFrom: "parties" },
          { name: "amount", label: "Amount", type: "number" },
          { name: "payment_mode", label: "Payment Mode", type: "select", options: PAYMENT_MODES, default: "cash" },
          { name: "cheque_no", label: "Cheque / Ref No." },
          { name: "against_invoice", label: "Against Invoice No." },
          { name: "notes", label: "Notes", type: "textarea", full: true },
        ]}
        columns={[
          { key: "receipt_no", label: "Receipt No." },
          { key: "date", label: "Date" },
          {
            key: "direction",
            label: "Direction",
            render: (r) => (
              <Badge
                className={`rounded-full ${
                  r.direction === "paid"
                    ? "bg-secondary/15 text-secondary hover:bg-secondary/15"
                    : "bg-primary/10 text-primary hover:bg-primary/10"
                }`}
              >
                {r.direction === "paid" ? "Paid out" : "Received"}
              </Badge>
            ),
          },
          { key: "party_id", label: "Party", render: (r, lk) => nameOf(lk.parties, r.party_id) },
          { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
          { key: "payment_mode", label: "Mode" },
          { key: "against_invoice", label: "Against Invoice" },
        ]}
      />

      <h2 className="font-head mb-3 mt-10 text-base font-extrabold md:text-lg">Party Outstanding</h2>
      <DataTable
        testid="outstanding-table"
        rows={out?.parties || []}
        loading={!out}
        columns={[
          { key: "name", label: "Party" },
          { key: "roles", label: "Roles", render: (r) => (r.roles || []).map(roleLabel).join(", ") || "-" },
          { key: "village", label: "Village" },
          { key: "debit", label: "Debit", align: "right", render: (r) => money(r.debit) },
          { key: "credit", label: "Credit", align: "right", render: (r) => money(r.credit) },
          {
            key: "balance",
            label: "Balance",
            align: "right",
            render: (r) => (
              <span className={r.balance >= 0 ? "text-primary" : "text-destructive"}>{money(r.balance)}</span>
            ),
          },
        ]}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Positive balance = party owes you. Negative = you owe the party.
      </p>
    </div>
  );
};

export default Receipts;
