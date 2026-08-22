import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileSpreadsheet, Search } from "lucide-react";
import api, { money, numFmt } from "@/lib/api";
import { PageHeader, StatCard } from "@/components/Shell";
import { downloadExcel, mapRows } from "@/lib/excel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const LotTrace = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState({});
  const [term, setTerm] = useState("");

  useEffect(() => {
    api
      .get("/lots/trace")
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) =>
    !term
      ? true
      : [r.lot_no, r.farmer, r.vehicle_no, r.godown].some((v) =>
          String(v || "").toLowerCase().includes(term.toLowerCase())
        )
  );

  const totals = filtered.reduce(
    (s, r) => ({
      inBags: s.inBags + r.in_bags,
      balance: s.balance + r.balance_bags,
      margin: s.margin + r.margin,
    }),
    { inBags: 0, balance: 0, margin: 0 }
  );

  return (
    <div data-testid="lot-trace-page">
      <PageHeader
        title="Lot Traceability"
        subtitle="Follow every potato lot from the farmer purchase through to company sales."
        action={
          <Button
            variant="outline"
            className="gap-2"
            data-testid="lots-excel-btn"
            onClick={() =>
              downloadExcel({
                filename: "lot-traceability",
                sheets: [
                  {
                    name: "Lots",
                    rows: mapRows(filtered, [
                      { label: "Lot No.", value: (r) => r.lot_no },
                      { label: "Purchase No.", value: (r) => r.purchase_no },
                      { label: "Purchase Date", value: (r) => r.purchase_date },
                      { label: "Farmer", value: (r) => r.farmer },
                      { label: "Product", value: (r) => r.product },
                      { label: "Godown", value: (r) => r.godown },
                      { label: "Vehicle", value: (r) => r.vehicle_no },
                      { label: "In Bags", value: (r) => r.in_bags },
                      { label: "In Weight", value: (r) => r.in_weight },
                      { label: "Purchase Value", value: (r) => r.purchase_value },
                      { label: "Sold Bags", value: (r) => r.sold_bags },
                      { label: "Balance Bags", value: (r) => r.balance_bags },
                      { label: "Sale Value", value: (r) => r.sale_value },
                      { label: "Margin", value: (r) => r.margin },
                    ]),
                  },
                  {
                    name: "Lot Sales",
                    rows: filtered.flatMap((r) =>
                      r.sales.map((s) => ({
                        "Lot No.": r.lot_no,
                        Invoice: s.invoice_no,
                        Date: s.date,
                        Company: s.company,
                        Bags: s.bags,
                        Weight: s.weight,
                        Amount: s.amount,
                        Mode: s.payment_mode,
                      }))
                    ),
                  },
                ],
              })
            }
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard testid="lots-count" label="Lots Tracked" value={numFmt(filtered.length)} />
        <StatCard testid="lots-balance" label="Unsold Bags" value={numFmt(totals.balance.toFixed(2))} />
        <StatCard testid="lots-margin" label="Gross Margin" value={money(totals.margin)} />
      </div>

      <div className="relative mb-4 w-full max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="lots-search"
          className="bg-white pl-8"
          placeholder="Search lot, farmer, vehicle..."
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading lots...</p>}
      {!loading && filtered.length === 0 && (
        <p data-testid="lots-empty" className="border border-border bg-white p-10 text-center text-sm text-muted-foreground">
          No potato purchase lots recorded yet.
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((r, i) => {
          const key = `${r.lot_no}-${r.purchase_no}-${i}`;
          const isOpen = !!open[key];
          return (
            <div key={key} className="border border-border bg-white" data-testid={`lot-card-${r.lot_no}`}>
              <button
                className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-3 text-left transition-colors duration-200 hover:bg-muted/40"
                onClick={() => setOpen((s) => ({ ...s, [key]: !s[key] }))}
                data-testid={`lot-toggle-${r.lot_no}`}
              >
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <div>
                    <p className="font-head text-sm font-extrabold">Lot {r.lot_no}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.purchase_date} · {r.farmer} · {r.godown} · Vehicle {r.vehicle_no || "-"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-6 text-xs">
                  <span>
                    In <strong>{numFmt(r.in_bags)}</strong> bags
                  </span>
                  <span>
                    Sold <strong>{numFmt(r.sold_bags)}</strong>
                  </span>
                  <Badge
                    className={`rounded-full ${
                      r.balance_bags > 0
                        ? "bg-accent/25 text-accent-foreground hover:bg-accent/25"
                        : "bg-primary/10 text-primary hover:bg-primary/10"
                    }`}
                  >
                    {r.balance_bags > 0 ? `${numFmt(r.balance_bags)} bags in stock` : "Fully sold"}
                  </Badge>
                  <span className={r.margin >= 0 ? "text-primary" : "text-destructive"}>
                    Margin <strong>{money(r.margin)}</strong>
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border bg-muted/20 px-4 py-4">
                  <div className="grid gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Purchase</p>
                      <p className="mt-1 text-sm">{r.purchase_no}</p>
                      <p className="text-xs text-muted-foreground">{money(r.purchase_value)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Product</p>
                      <p className="mt-1 text-sm">{r.product}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Weight In</p>
                      <p className="mt-1 text-sm">{numFmt(r.in_weight)} kg</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Sale Value</p>
                      <p className="mt-1 text-sm">{money(r.sale_value)}</p>
                    </div>
                  </div>

                  <table className="mt-5 w-full min-w-[600px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 text-left">Invoice</th>
                        <th className="py-2 text-left">Date</th>
                        <th className="py-2 text-left">Company</th>
                        <th className="py-2 text-right">Bags</th>
                        <th className="py-2 text-right">Weight</th>
                        <th className="py-2 text-right">Amount</th>
                        <th className="py-2 text-left">Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.sales.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-xs text-muted-foreground">
                            Not sold yet — entire lot still in stock.
                          </td>
                        </tr>
                      )}
                      {r.sales.map((s) => (
                        <tr key={s.invoice_no} className="border-b border-border/60 last:border-0">
                          <td className="py-2">{s.invoice_no}</td>
                          <td className="py-2">{s.date}</td>
                          <td className="py-2">{s.company}</td>
                          <td className="py-2 text-right">{numFmt(s.bags)}</td>
                          <td className="py-2 text-right">{numFmt(s.weight)}</td>
                          <td className="py-2 text-right">{money(s.amount)}</td>
                          <td className="py-2">{s.payment_mode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LotTrace;
