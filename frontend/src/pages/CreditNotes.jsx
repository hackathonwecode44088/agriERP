import CrudPage from "@/components/CrudPage";
import { money } from "@/lib/api";
import { nameOf } from "@/components/Shell";

const CreditNotes = () => (
  <CrudPage
    testid="credit-notes"
    title="Credit Note"
    subtitle="Deductions and adjustments against farmer or company invoices. Farmer notes post to the ledger."
    endpoint="credit-notes"
    soft={false}
    searchKeys={["note_no", "against_invoice", "reason"]}
    fields={[
      { name: "date", label: "Date", type: "date" },
      {
        name: "party_type",
        label: "Party Type",
        type: "select",
        options: [
          { value: "farmer", label: "Farmer" },
          { value: "company", label: "Company" },
        ],
        default: "farmer",
      },
      { name: "party_id", label: "Farmer", type: "select", optionsFrom: "farmers" },
      { name: "against_invoice", label: "Against Invoice No." },
      { name: "amount", label: "Amount", type: "number" },
      {
        name: "category",
        label: "Category",
        type: "select",
        options: [
          { value: "seeds", label: "Seeds" },
          { value: "lenobag", label: "Leno Bag" },
          { value: "potato", label: "Potato" },
        ],
        default: "potato",
      },
      { name: "reason", label: "Reason", type: "textarea", full: true },
    ]}
    columns={[
      { key: "note_no", label: "Note No." },
      { key: "date", label: "Date" },
      { key: "party_type", label: "Party Type" },
      { key: "party_id", label: "Party", render: (r, lk) => nameOf(lk.farmers, r.party_id) },
      { key: "against_invoice", label: "Against Invoice" },
      { key: "category", label: "Category" },
      { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
      { key: "reason", label: "Reason" },
    ]}
  />
);

export default CreditNotes;
