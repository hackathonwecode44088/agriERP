import CrudPage, { StatusBadge } from "@/components/CrudPage";
import { STATUS_OPTIONS } from "@/lib/constants";

const Farmers = () => (
  <CrudPage
    testid="farmers"
    title="Farmer"
    subtitle="Farmers who buy seeds / leno bags and supply potatoes."
    endpoint="farmers"
    searchKeys={["name", "phone", "village"]}
    fields={[
      { name: "name", label: "Farmer Name" },
      { name: "phone", label: "Phone" },
      { name: "email", label: "Email (for statements)" },
      { name: "village", label: "Village" },
      { name: "aadhaar", label: "Aadhaar No." },
      { name: "bank_account", label: "Bank Account No." },
      { name: "ifsc", label: "IFSC Code" },
      { name: "address", label: "Address", type: "textarea", full: true },
      { name: "notes", label: "Notes", type: "textarea", full: true },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, default: "active" },
    ]}
    columns={[
      { key: "name", label: "Name" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "village", label: "Village" },
      { key: "bank_account", label: "Bank A/c" },
      { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    ]}
  />
);

export default Farmers;
