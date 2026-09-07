import CrudPage, { StatusBadge } from "@/components/CrudPage";
import { nameOf } from "@/components/Shell";
import { STATUS_OPTIONS, UNIT_OPTIONS } from "@/lib/constants";

const Products = () => (
  <CrudPage
    testid="products"
    title="Product"
    subtitle="Every item you buy or sell, grouped by category."
    endpoint="products"
    searchKeys={["name", "variety"]}
    filters={[
      { name: "category_id", label: "Category", allLabel: "All Categories", optionsFrom: "product-categories" },
    ]}
    fields={[
      { name: "category_id", label: "Category", type: "select", optionsFrom: "product-categories", required: true },
      { name: "name", label: "Product Name", required: true, minLength: 2 },
      { name: "variety", label: "Variety / Grade" },
      { name: "unit", label: "Unit", type: "select", options: UNIT_OPTIONS, default: "bag", required: true },
      { name: "hsn", label: "HSN Code", rule: "hsn" },
      { name: "opening_qty", label: "Opening Stock (Bags)", type: "number", rule: "nonneg" },
      { name: "notes", label: "Notes", type: "textarea", full: true },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, default: "active" },
    ]}
    columns={[
      { key: "name", label: "Product" },
      {
        key: "category_id",
        label: "Category",
        render: (r, lk) => nameOf(lk["product-categories"], r.category_id),
      },
      { key: "variety", label: "Variety" },
      { key: "unit", label: "Unit" },
      { key: "hsn", label: "HSN" },
      { key: "opening_qty", label: "Opening", align: "right" },
      { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    ]}
  />
);

export default Products;
