import CrudPage, { StatusBadge } from "@/components/CrudPage";
import { RATE_BASIS, STATUS_OPTIONS } from "@/lib/constants";
import { money } from "@/lib/api";
import { nameOf } from "@/components/Shell";

const KIND_OPTIONS = [
  { value: "sales", label: "Sale Rate" },
  { value: "purchases", label: "Purchase Rate" },
];

const PriceLists = () => (
  <CrudPage
    testid="price-lists"
    title="Price List"
    subtitle="Set an agreed rate per party and product. Matching rates auto-fill on purchase and sale entry."
    endpoint="price-lists"
    searchKeys={["notes"]}
    filters={[
      { name: "party_id", label: "Party", allLabel: "All Parties", optionsFrom: "parties" },
      { name: "kind", label: "Rate Type", allLabel: "All Types", options: KIND_OPTIONS },
    ]}
    fields={[
      { name: "party_id", label: "Party", type: "select", optionsFrom: "parties", required: true },
      { name: "product_id", label: "Product", type: "select", optionsFrom: "products", required: true },
      { name: "kind", label: "Rate Type", type: "select", options: KIND_OPTIONS, default: "sales", required: true },
      { name: "rate", label: "Agreed Rate", type: "number", required: true, rule: "positive" },
      { name: "rate_basis", label: "Rate Basis", type: "select", options: RATE_BASIS, default: "bag", required: true },
      { name: "valid_from", label: "Valid From", type: "date", required: true, rule: "date" },
      { name: "notes", label: "Notes", type: "textarea", full: true },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, default: "active" },
    ]}
    columns={[
      { key: "party_id", label: "Party", render: (r, lk) => nameOf(lk.parties, r.party_id) },
      { key: "product_id", label: "Product", render: (r, lk) => nameOf(lk.products, r.product_id) },
      { key: "kind", label: "Type", render: (r) => (r.kind === "purchases" ? "Purchase" : "Sale") },
      { key: "rate", label: "Rate", align: "right", render: (r) => money(r.rate) },
      { key: "rate_basis", label: "Basis", render: (r) => (r.rate_basis === "weight" ? "Per Kg" : "Per Bag") },
      { key: "valid_from", label: "Valid From" },
      { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    ]}
  />
);

export default PriceLists;
