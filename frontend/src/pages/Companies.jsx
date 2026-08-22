import CrudPage, { StatusBadge } from "@/components/CrudPage";
import { STATUS_OPTIONS } from "@/lib/constants";

const Companies = () => (
  <CrudPage
    testid="companies"
    title="Company"
    subtitle="Buyers of potato stock."
    endpoint="companies"
    searchKeys={["name", "phone", "city"]}
    fields={[
      { name: "name", label: "Company Name" },
      { name: "contact_person", label: "Contact Person" },
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
      { key: "contact_person", label: "Contact" },
      { key: "phone", label: "Phone" },
      { key: "city", label: "City" },
      { key: "gstin", label: "GSTIN" },
      { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    ]}
  />
);

export default Companies;
