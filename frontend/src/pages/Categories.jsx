import CrudPage, { StatusBadge } from "@/components/CrudPage";
import { GST_RATES, STATUS_OPTIONS, UNIT_OPTIONS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

const Categories = () => (
  <CrudPage
    testid="categories"
    title="Product Category"
    subtitle="Add any category you trade in — seeds, leno bags, potato, or anything new. Lot tracking turns on lot and vehicle fields."
    endpoint="product-categories"
    searchKeys={["name"]}
    fields={[
      { name: "name", label: "Category Name", required: true, minLength: 2 },
      { name: "unit", label: "Default Unit", type: "select", options: UNIT_OPTIONS, default: "bag", required: true },
      {
        name: "tracks_lot",
        label: "Track Lot / Vehicle",
        type: "select",
        options: [
          { value: "true", label: "Yes — lot-wise stock" },
          { value: "false", label: "No" },
        ],
        default: "false",
      },
      { name: "gst_default", label: "Default GST %", type: "select", options: GST_RATES, default: "0" },
      {
        name: "custom_fields",
        label: "Custom Fields (shown on purchase/sale entry)",
        type: "customfields",
        default: [],
        full: true,
      },
      { name: "notes", label: "Notes", type: "textarea", full: true },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, default: "active" },
    ]}
    columns={[
      { key: "name", label: "Category" },
      { key: "unit", label: "Unit" },
      {
        key: "tracks_lot",
        label: "Lot Tracking",
        render: (r) =>
          r.tracks_lot ? (
            <Badge className="rounded-full bg-accent/25 text-accent-foreground hover:bg-accent/25">Lot-wise</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">No</span>
          ),
      },
      { key: "gst_default", label: "GST %", align: "right", render: (r) => `${Number(r.gst_default || 0)}%` },
      {
        key: "custom_fields",
        label: "Custom Fields",
        render: (r) =>
          (r.custom_fields || []).length ? (
            <span className="flex flex-wrap gap-1">
              {r.custom_fields.map((cf) => (
                <Badge key={cf.key} className="rounded-full bg-secondary/15 text-secondary hover:bg-secondary/15">
                  {cf.label}
                </Badge>
              ))}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    ]}
  />
);

export default Categories;
