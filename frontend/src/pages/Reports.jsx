import { useCallback, useEffect, useState } from "react";
import { Download, Filter, FileSpreadsheet } from "lucide-react";
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
  const [category, setCategory] = useState("all");
  const [partyId, setPartyId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [parties, setParties] = useState([]);

  useEffect(() => {
    Promise.all([api.get("/farmers"), api.get("/companies"), api.get("/vendors")]).then(([f, c, v]) =>
      setParties([...f.data, ...c.data, ...v.data])
    );
  }, []);

  const run = useCallback(() => {
    const params = { kind };
    if (category !== "all") params.category = category;
    if (partyId !== "all") params.party_id = partyId;
    if (from) params.date_from = from;
    if (to) params.date_to = to;
    api.get("/reports/transactions", { params }).then(({ data }) => setData(data));
  }, [kind, category, partyId, from, to]);

  useEffect(() => {
    run();
  }, [run]);

  const nameOfParty = (id) => parties.find((p) => p.id === id)?.name || "-";

  const reportColumns = [
    { label: "No.", value: (r) => r.invoice_no },
    { label: "Date", value: (r) => r.date },
    { label: "Category", value: (r) => r.category },
    { label: "Party", value: (r) => nameOfParty(r.party_id) },
    { label: "Lot", value: (r) => r.lot_no },
    { label: "Vehicle", value: (r) => r.vehicle_no },
    { label: "Bags", value: (r) => r.bags },
    { label: "Weight", value: (r) => r.weight },
    { label: "Rate", value: (r) => r.rate },
    { label: "Amount", value: (r) => r.amount },
    { label: "Type", value: (r) => r.payment_type },
    { label: "Mode", value: (r) => r.payment_mode },
  ];
  const reportTitle = `${kind === "sales" ? "Sales" : "Purchases"} Report`;

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
                  filename: reportTitle.replace(/\s+/g, "-").toLowerCase(),
                  sheets: [
                    { name: reportTitle, rows: mapRows(data.rows, reportColumns) },
                    {
                      name: "Totals",
                      rows: [
                        {
                          Records: data.totals.count,
                          Bags: data.totals.bags,
                          Weight: data.totals.weight,
                          Amount: data.totals.amount,
                        },
                      ],
                    },
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
                downloadReportPdf({
                  title: reportTitle,
                  rows: data.rows,
                  totals: data.totals,
                  columns: reportColumns.slice(0, 8),
                })
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
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="reports-category" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="seeds">Seeds</SelectItem>
              <SelectItem value="lenobag">Leno Bag</SelectItem>
              <SelectItem value="potato">Potato</SelectItem>
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
          { key: "category", label: "Category" },
          { key: "party_id", label: "Party", render: (r) => nameOfParty(r.party_id) },
          { key: "lot_no", label: "Lot No." },
          { key: "vehicle_no", label: "Vehicle" },
          { key: "bags", label: "Bags", align: "right" },
          { key: "weight", label: "Weight", align: "right" },
          { key: "rate", label: "Rate", align: "right" },
          { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
          { key: "payment_type", label: "Type" },
        ]}
      />
    </div>
  );
};

export default Reports;
