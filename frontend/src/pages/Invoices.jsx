import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import api, { money } from "@/lib/api";
import { DataTable, PageHeader } from "@/components/Shell";
import { downloadInvoicePdf } from "@/lib/pdf";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const Invoices = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState("all");
  const [refs, setRefs] = useState({ farmers: [], companies: [], vendors: [], products: [], godowns: [] });
  const [company, setCompany] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/farmers"),
      api.get("/companies"),
      api.get("/vendors"),
      api.get("/products"),
      api.get("/godowns"),
      api.get("/company-profile"),
    ])
      .then(([f, c, v, p, g, cp]) => {
        setRefs({ farmers: f.data, companies: c.data, vendors: v.data, products: p.data, godowns: g.data });
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
  }, [kind]);

  const partyName = (r) => {
    const pool =
      r.party_type === "farmer" ? refs.farmers : r.party_type === "company" ? refs.companies : refs.vendors;
    return pool.find((x) => x.id === r.party_id)?.name || "-";
  };
  const productName = (r) => refs.products.find((x) => x.id === r.product_id)?.name || "-";
  const godownName = (r) => refs.godowns.find((x) => x.id === r.godown_id)?.name || "-";

  const totals = useMemo(() => rows.reduce((s, r) => s + Number(r.amount || 0), 0), [rows]);

  return (
    <div data-testid="invoices-page">
      <PageHeader
        title="Invoices & Vouchers"
        subtitle="All sale invoices and purchase vouchers with PDF download."
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
          { key: "category", label: "Category" },
          { key: "party", label: "Party", render: (r) => partyName(r) },
          { key: "product", label: "Product", render: (r) => productName(r) },
          { key: "bags", label: "Bags", align: "right" },
          { key: "amount", label: "Taxable", align: "right", render: (r) => money(r.amount) },
          {
            key: "total_amount",
            label: "Total",
            align: "right",
            render: (r) => money(r.total_amount ?? r.amount),
          },
          { key: "payment_mode", label: "Mode" },
        ]}
        actions={(row) => (
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
        )}
      />
    </div>
  );
};

export default Invoices;
