import { useParams } from "react-router-dom";
import CrudPage, { StatusBadge } from "@/components/CrudPage";
import { CATEGORY_META, STATUS_OPTIONS } from "@/lib/constants";

const Products = () => {
  const { category } = useParams();
  const meta = CATEGORY_META[category] || { label: category };

  return (
    <CrudPage
      key={category}
      testid={`products-${category}`}
      title={`${meta.label} Product`}
      subtitle={`Manage ${meta.label.toLowerCase()} items and varieties.`}
      endpoint="products"
      query={{ category }}
      defaults={{ category }}
      searchKeys={["name", "variety"]}
      fields={[
        { name: "name", label: "Product Name" },
        { name: "variety", label: "Variety / Grade" },
        {
          name: "unit",
          label: "Unit",
          type: "select",
          options: [
            { value: "bag", label: "Bag / Katta" },
            { value: "kg", label: "Kilogram" },
            { value: "piece", label: "Piece" },
          ],
          default: "bag",
        },
        { name: "hsn", label: "HSN Code" },
        { name: "opening_qty", label: "Opening Stock (Bags)", type: "number" },
        { name: "notes", label: "Notes", type: "textarea", full: true },
        { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, default: "active" },
      ]}
      columns={[
        { key: "name", label: "Product" },
        { key: "variety", label: "Variety" },
        { key: "unit", label: "Unit" },
        { key: "hsn", label: "HSN" },
        { key: "opening_qty", label: "Opening", align: "right" },
        { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
};

export default Products;
