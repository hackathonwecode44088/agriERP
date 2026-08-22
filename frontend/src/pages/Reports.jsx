import { useCallback, useEffect, useState } from "react";
import { Download, FileSpreadsheet, Filter } from "lucide-react";
import api, { money, numFmt } from "@/lib/api";
import { DataTable, PageHeader, StatCard } from "@/components/Shell";
import { downloadReportPdf } from "@/lib/pdf";
import { downloadExcel, mapRows } from "@/lib/excel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Reports = () => {
  const [kind, setKind] = useState("sales");
  const [categoryId, setCategoryId] = useState("all");
  const [partyId, setPartyId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [parties, setParties] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get("/parties").then(({ data }) => setParties(data)).catch(() => {});
    api.get("/product-categories").then(({ data }) => setCategories(data)).catch(() => {});
  }, []);

  const run = useCallback(() => {
    const params = { kind };
    if (categoryId !== "all") params.category_id = categoryId;
    if (partyId !== "all") params.party_id = partyId;
    if (from) params.date_from = from;
    if (to) params.date_to = to;
    api.get("/reports/transactions", { params }).then(({ data }) => setData(data));
  }, [kind, categoryId, partyId, from, to]);

  useEffect(() => {
    run();
  }, [run]);

  const nameOfParty = (id) => parties.find((p) => p.id === id)?.name || "-";
  const nameOfCategory = (id) => categories.find((c) => c.id === id)?.name || "-";
  const title = `${kind === "sales" ? "Sales" : "Purchases"} Report`;

  const columns = [
    { label: "No.", value: (r) => r.invoice_no },
    { label: "Date", value: (r) => r.date },
    { label: "Category", value: (r) => nameOfCategory(r.category_id) },
    { label: "Party", value: (r) => nameOfParty(r.party_id) },
    { label: "Lot", value: (r) => r.lot_no },
    { label: "Bags", value: (r) => r.bags },
    { label: "Weight", value: (r) => r.weight },
    { label: "Rate", value: (r) => r.rate },
    { label: "Taxable", value: (r) => r.amount },
    { label: "Total", value: (r) => r.total_amount ?? r.amount },
    { label: "Type", value: (r) => r.payment_type },
    { label: "Status", value: (r) => r.payment_status },
  ];

  return (
    <div data-testid="reports-page">
      <PageHeader
        title="Reports"
        subtitle="Filter purchases and sales by category, party and date range."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={!data}
              data-testid="reports-excel-btn"
              onClick={() =>
                downloadExcel({
                  filename: title.replace(/\s+/g, "-").toLowerCase(),
                  sheets: [
                    { name: title, rows: mapRows(data.rows, columns) },
                    { name: "Totals", rows: [data.totals] },
                  ],
                })
              }
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={!data}
              data-testid="reports-pdf-btn"
              onClick={() =>
                downloadReportPdf({ title, rows: data.rows, totals: data.totals, columns: columns.slice(0, 8) })
              }
            >
              <Download className="h-4 w-4" /> PDF
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <Label className="text-xs">Report Type</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger data-testid="reports-kind" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="sales">Sales</SelectItem>
              <SelectItem value="purchases">Purchases</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger data-testid="reports-category" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Party</Label>
          <Select value={partyId} onValueChange={setPartyId}>
            <SelectTrigger data-testid="reports-party" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="all">All Parties</SelectItem>
              {parties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">From Date</Label>
          <Input data-testid="reports-from" type="date" className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To Date</Label>
          <Input data-testid="reports-to" type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="lg:col-span-5">
          <Button onClick={run} className="gap-2" data-testid="reports-run">
            <Filter className="h-4 w-4" /> Apply Filters
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard testid="report-count" label="Records" value={numFmt(data?.totals?.count)} />
        <StatCard testid="report-bags" label="Total Bags" value={numFmt(data?.totals?.bags)} />
        <StatCard testid="report-weight" label="Total Weight (kg)" value={numFmt(data?.totals?.weight)} />
        <StatCard testid="report-amount" label="Total Amount" value={money(data?.totals?.amount)} />
      </div>

      <DataTable
        testid="reports"
        loading={!data}
        rows={data?.rows || []}
        columns={[
          { key: "invoice_no", label: "No." },
          { key: "date", label: "Date" },
          { key: "category_id", label: "Category", render: (r) => nameOfCategory(r.category_id) },
          { key: "party_id", label: "Party", render: (r) => nameOfParty(r.party_id) },
          { key: "lot_no", label: "Lot No." },
          { key: "bags", label: "Bags", align: "right" },
          { key: "weight", label: "Weight", align: "right" },
          { key: "rate", label: "Rate", align: "right" },
          { key: "amount", label: "Taxable", align: "right", render: (r) => money(r.amount) },
          { key: "total_amount", label: "Total", align: "right", render: (r) => money(r.total_amount ?? r.amount) },
          { key: "payment_status", label: "Status" },
        ]}
      />
    </div>
  );
};

export default Reports;
