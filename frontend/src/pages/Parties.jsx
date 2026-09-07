import CrudPage, { StatusBadge } from "@/components/CrudPage";
import { ROLE_OPTIONS, STATUS_OPTIONS, roleLabel } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

const Parties = () => (
  <CrudPage
    testid="parties"
    title="Party"
    subtitle="One record per person or business. Anyone can buy and sell — just pick their roles."
    endpoint="parties"
    searchKeys={["name", "phone", "village", "city", "gstin"]}
    filters={[
      {
        name: "role",
        label: "Role",
        allLabel: "All Roles",
        options: ROLE_OPTIONS,
      },
    ]}
    fields={[
      { name: "name", label: "Party Name", required: true, minLength: 2 },
      {
        name: "roles",
        label: "Roles (buy / sell)",
        type: "multiselect",
        options: ROLE_OPTIONS,
        default: [],
        full: true,
        required: true,
      },
      { name: "phone", label: "Phone", required: true, rule: "phone", placeholder: "10-digit mobile" },
      { name: "email", label: "Email (for statements)", rule: "email" },
      { name: "village", label: "Village" },
      { name: "city", label: "City" },
      { name: "gstin", label: "GSTIN", rule: "gstin", placeholder: "24ABCDE1234F1Z5" },
      { name: "contact_person", label: "Contact Person" },
      { name: "aadhaar", label: "Aadhaar No.", rule: "aadhaar" },
      { name: "bank_account", label: "Bank Account No.", rule: "bank_account" },
      { name: "ifsc", label: "IFSC Code", rule: "ifsc", placeholder: "SBIN0001234" },
      { name: "address", label: "Address", type: "textarea", full: true },
      { name: "notes", label: "Notes", type: "textarea", full: true },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, default: "active" },
    ]}
    columns={[
      { key: "name", label: "Name" },
      {
        key: "roles",
        label: "Roles",
        render: (r) => (
          <span className="flex flex-wrap gap-1">
            {(r.roles || []).map((role) => (
              <Badge key={role} className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                {roleLabel(role)}
              </Badge>
            ))}
          </span>
        ),
      },
      { key: "phone", label: "Phone" },
      { key: "village", label: "Village" },
      { key: "email", label: "Email" },
      { key: "gstin", label: "GSTIN" },
      { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    ]}
  />
);

export default Parties;
