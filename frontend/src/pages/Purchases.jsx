import { useParams } from "react-router-dom";
import CrudPage from "@/components/CrudPage";
import { money } from "@/lib/api";
import { nameOf } from "@/components/Shell";
import { CATEGORY_META, PAYMENT_MODES, PAYMENT_TYPES, RATE_BASIS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

const Purchases = () => {
  const { category } = useParams();
  const meta = CATEGORY_META[category] || { label: category, supplier: "vendors", supplierLabel: "Vendor" };
  const partySource = meta.supplier;
  const productSource = `products?category=${category}`;

  return (
    <CrudPage
      key={category}
      testid={`purchases-${category}`}
      title={`${meta.label} Purchase`}
      subtitle={`Record purchases of ${meta.label.toLowerCase()} from ${meta.supplierLabel.toLowerCase()}s.`}
      endpoint="purchases"
      query={{ category }}
      defaults={{ category, party_type: category === "potato" ? "farmer" : "vendor" }}
      computeAmount
      rateAlert={{ kind: "purchases" }}
      soft={false}
      searchKeys={["invoice_no", "lot_no", "vehicle_no"]}
      fields={[
        { name: "date", label: "Date", type: "date" },
        { name: "party_id", label: meta.supplierLabel, type: "select", optionsFrom: partySource },
        { name: "product_id", label: "Product", type: "select", optionsFrom: productSource },
        { name: "godown_id", label: "Godown / Cold Storage", type: "select", optionsFrom: "godowns" },
        { name: "lot_no", label: "Lot No." },
        { name: "vehicle_no", label: "Vehicle No." },
        { name: "bags", label: "Bag / Katta", type: "number" },
        { name: "weight", label: "Weight (kg)", type: "number" },
        { name: "rate_basis", label: "Rate Basis", type: "select", options: RATE_BASIS, default: "bag" },
        { name: "rate", label: "Rate", type: "number" },
        { name: "payment_type", label: "Type", type: "select", options: PAYMENT_TYPES, default: "cash" },
        { name: "payment_mode", label: "Payment Mode", type: "select", options: PAYMENT_MODES, default: "cash" },
        { name: "cheque_no", label: "Cheque / Ref No." },
        { name: "notes", label: "Notes", type: "textarea", full: true },
      ]}
      columns={[
        { key: "invoice_no", label: "Voucher" },
        { key: "date", label: "Date" },
        {
          key: "party_id",
          label: meta.supplierLabel,
          render: (r, lk) => nameOf(lk[partySource], r.party_id),
        },
        { key: "product_id", label: "Product", render: (r, lk) => nameOf(lk[productSource], r.product_id) },
        { key: "lot_no", label: "Lot No." },
        { key: "vehicle_no", label: "Vehicle" },
        { key: "bags", label: "Bags", align: "right" },
        { key: "weight", label: "Weight", align: "right" },
        { key: "rate", label: "Rate", align: "right" },
        { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
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
      ]}
    />
  );
};

export default Purchases;
