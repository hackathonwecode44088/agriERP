import CrudPage, { StatusBadge } from "@/components/CrudPage";
import { STATUS_OPTIONS } from "@/lib/constants";

const Vendors = () => (
  <CrudPage
    testid="vendors"
    title="Vendor"
    subtitle="Suppliers of seeds and leno bags."
    endpoint="vendors"
    searchKeys={["name", "phone", "city"]}
    fields={[
      { name: "name", label: "Vendor Name" },
      {
        name: "kind",
        label: "Supplies",
        type: "select",
        options: [
          { value: "seeds", label: "Seeds" },
          { value: "lenobag", label: "Leno Bag" },
          { value: "both", label: "Both" },
        ],
        default: "both",
      },
      { name: "phone", label: "Phone" },
      { name: "email", label: "Email" },
      { name: "gstin", label: "GSTIN" },
      { name: "city", label: "City" },
      { name: "address", label: "Address", type: "textarea", full: true },
      { name: "notes", label: "Notes", type: "textarea", full: true },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, default: "active" },
    ]}
    columns={[
      { key: "name", label: "Name" },
      { key: "kind", label: "Supplies" },
      { key: "phone", label: "Phone" },
      { key: "city", label: "City" },
      { key: "gstin", label: "GSTIN" },
      { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    ]}
  />
);

export default Vendors;
