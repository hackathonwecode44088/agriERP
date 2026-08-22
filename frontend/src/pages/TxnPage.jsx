import CrudPage from "@/components/CrudPage";
import { money } from "@/lib/api";
import { nameOf } from "@/components/Shell";
import { GST_RATES, PAYMENT_MODES, PAYMENT_STATUS, PAYMENT_TYPES, RATE_BASIS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

const statusBadge = (r) => (
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
);

export const TxnPage = ({ kind }) => {
  const isSale = kind === "sales";

  return (
    <CrudPage
      testid={kind}
      title={isSale ? "Sale" : "Purchase"}
      subtitle={
        isSale
          ? "Sell any product to any party. Stock is checked and the party ledger is posted automatically."
          : "Buy any product from any party. The party ledger is posted automatically."
      }
      endpoint={kind}
      soft={false}
      computeAmount
      gst
      rateAlert={{ kind }}
      searchKeys={["invoice_no", "lot_no", "vehicle_no"]}
      filters={[
        { name: "category_id", label: "Category", allLabel: "All Categories", optionsFrom: "product-categories" },
        { name: "party_id", label: "Party", allLabel: "All Parties", optionsFrom: "parties" },
      ]}
      fields={[
        { name: "date", label: "Date", type: "date" },
        { name: "category_id", label: "Category", type: "select", optionsFrom: "product-categories" },
        { name: "party_id", label: isSale ? "Buyer" : "Supplier", type: "select", optionsFrom: "parties" },
        {
          name: "product_id",
          label: "Product",
          type: "select",
          optionsFrom: "products",
          optionsFilterBy: "category_id",
        },
        { name: "godown_id", label: "Godown / Cold Storage", type: "select", optionsFrom: "godowns" },
        { name: "lot_no", label: "Lot No." },
        { name: "vehicle_no", label: "Vehicle No." },
        { name: "bags", label: "Bag / Katta", type: "number" },
        { name: "weight", label: "Weight (kg)", type: "number" },
        { name: "rate_basis", label: "Rate Basis", type: "select", options: RATE_BASIS, default: "bag" },
        { name: "rate", label: "Rate", type: "number" },
        { name: "gst_rate", label: "GST Rate", type: "select", options: GST_RATES, default: "0" },
        { name: "payment_type", label: "Type", type: "select", options: PAYMENT_TYPES, default: "cash" },
        { name: "payment_mode", label: "Payment Mode", type: "select", options: PAYMENT_MODES, default: "cash" },
        { name: "payment_status", label: "Payment Status", type: "select", options: PAYMENT_STATUS, default: "paid" },
        { name: "cheque_no", label: "Cheque / Ref No." },
        { name: "notes", label: "Notes", type: "textarea", full: true },
      ]}
      columns={[
        { key: "invoice_no", label: isSale ? "Invoice" : "Voucher" },
        { key: "date", label: "Date" },
        {
          key: "category_id",
          label: "Category",
          render: (r, lk) => nameOf(lk["product-categories"], r.category_id),
        },
        { key: "party_id", label: isSale ? "Buyer" : "Supplier", render: (r, lk) => nameOf(lk.parties, r.party_id) },
        { key: "product_id", label: "Product", render: (r, lk) => nameOf(lk.products, r.product_id) },
        { key: "lot_no", label: "Lot No." },
        { key: "bags", label: "Bags", align: "right" },
        { key: "weight", label: "Weight", align: "right" },
        { key: "rate", label: "Rate", align: "right" },
        { key: "amount", label: "Taxable", align: "right", render: (r) => money(r.amount) },
        { key: "gst_rate", label: "GST %", align: "right", render: (r) => `${Number(r.gst_rate || 0)}%` },
        {
          key: "total_amount",
          label: "Total",
          align: "right",
          render: (r) => money(r.total_amount ?? r.amount),
        },
        {
          key: "payment_type",
          label: "Type",
          render: (r) => (
            <Badge
              className={`rounded-full ${
                r.payment_type === "credit"
                  ? "bg-secondary/15 text-secondary hover:bg-secondary/15"
                  : "bg-accent/25 text-accent-foreground hover:bg-accent/25"
              }`}
            >
              {r.payment_type === "credit" ? "Credit / ઉધાર" : "Cash / રોકડા"}
            </Badge>
          ),
        },
        { key: "payment_status", label: "Status", render: statusBadge },
      ]}
    />
  );
};

export default TxnPage;
