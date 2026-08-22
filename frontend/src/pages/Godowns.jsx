import CrudPage, { StatusBadge } from "@/components/CrudPage";
import { STATUS_OPTIONS } from "@/lib/constants";

const Godowns = () => (
  <CrudPage
    testid="godowns"
    title="Godown / Cold Storage"
    subtitle="Storage locations used for stock movement."
    endpoint="godowns"
    searchKeys={["name", "location", "manager"]}
    fields={[
      { name: "name", label: "Godown Name" },
      {
        name: "kind",
        label: "Type",
        type: "select",
        options: [
          { value: "godown", label: "Godown" },
          { value: "cold_storage", label: "Cold Storage" },
        ],
        default: "godown",
      },
      { name: "location", label: "Location" },
      { name: "capacity_bags", label: "Capacity (Bags)", type: "number" },
      { name: "manager", label: "Manager" },
      { name: "phone", label: "Phone" },
      { name: "notes", label: "Notes", type: "textarea", full: true },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, default: "active" },
    ]}
    columns={[
      { key: "name", label: "Name" },
      { key: "kind", label: "Type" },
      { key: "location", label: "Location" },
      { key: "capacity_bags", label: "Capacity", align: "right" },
      { key: "manager", label: "Manager" },
      { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    ]}
  />
);

export default Godowns;
