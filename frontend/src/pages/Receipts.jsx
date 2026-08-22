import { useEffect, useState } from "react";
import api, { money } from "@/lib/api";
import CrudPage from "@/components/CrudPage";
import { DataTable, StatCard } from "@/components/Shell";
import { PAYMENT_MODES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

const Receipts = () => {
  const [out, setOut] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api.get("/outstanding").then(({ data }) => setOut(data)).catch(() => {});
  }, [tick]);

  return (
    <div data-testid="receipts-page">
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <StatCard
          testid="outstanding-farmers"
          label="Net Farmer Balance"
          value={money(out?.totals?.farmer_balance)}
          sub="Positive = receivable from farmers"
        />
        <StatCard
          testid="outstanding-companies"
          label="Net Company Receivable"
          value={money(out?.totals?.company_balance)}
          sub="Billed minus payments received"
        />
      </div>

      <CrudPage
        testid="receipts"
        title="Payment Receipt"
        subtitle="Money received from farmers/companies or paid out to farmers. Farmer entries settle the ledger automatically."
        endpoint="receipts"
        soft={false}
        onChanged={() => setTick((t) => t + 1)}
        searchKeys={["receipt_no", "against_invoice", "notes"]}
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
          {
            name: "party_type",
            label: "Party Type",
            type: "select",
            options: [
              { value: "farmer", label: "Farmer" },
              { value: "company", label: "Company" },
            ],
            default: "farmer",
          },
          { name: "party_id", label: "Party", type: "select", optionsFrom: ["farmers", "companies"] },
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
          { key: "party_type", label: "Party Type" },
          {
            key: "party_id",
            label: "Party",
            render: (r, lk) =>
              [...(lk.farmers || []), ...(lk.companies || [])].find((x) => x.id === r.party_id)?.name || "-",
          },
          { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
          { key: "payment_mode", label: "Mode" },
          { key: "against_invoice", label: "Against Invoice" },
        ]}
      />

      <h2 className="font-head mb-3 mt-10 text-base font-extrabold md:text-lg">Farmer Outstanding</h2>
      <DataTable
        testid="outstanding-farmer-table"
        rows={out?.farmers || []}
        loading={!out}
        columns={[
          { key: "name", label: "Farmer" },
          { key: "village", label: "Village" },
          { key: "debit", label: "Debit", align: "right", render: (r) => money(r.debit) },
          { key: "credit", label: "Credit", align: "right", render: (r) => money(r.credit) },
          { key: "balance", label: "Balance", align: "right", render: (r) => money(r.balance) },
        ]}
      />

      <h2 className="font-head mb-3 mt-8 text-base font-extrabold md:text-lg">Company Outstanding</h2>
      <DataTable
        testid="outstanding-company-table"
        rows={out?.companies || []}
        loading={!out}
        columns={[
          { key: "name", label: "Company" },
          { key: "billed", label: "Billed", align: "right", render: (r) => money(r.billed) },
          { key: "received", label: "Received", align: "right", render: (r) => money(r.received) },
          { key: "balance", label: "Balance", align: "right", render: (r) => money(r.balance) },
        ]}
      />
    </div>
  );
};

export default Receipts;
