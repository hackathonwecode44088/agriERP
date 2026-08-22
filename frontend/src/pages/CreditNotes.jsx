import CrudPage from "@/components/CrudPage";
import { money } from "@/lib/api";
import { nameOf } from "@/components/Shell";

const CreditNotes = () => (
  <CrudPage
    testid="credit-notes"
    title="Credit Note"
    subtitle="Deductions and adjustments against any party's invoice. Posts a credit to their ledger."
    endpoint="credit-notes"
    soft={false}
    searchKeys={["note_no", "against_invoice", "reason"]}
    fields={[
      { name: "date", label: "Date", type: "date" },
      { name: "party_id", label: "Party", type: "select", optionsFrom: "parties" },
      { name: "category_id", label: "Category", type: "select", optionsFrom: "product-categories" },
      { name: "against_invoice", label: "Against Invoice No." },
      { name: "amount", label: "Amount", type: "number" },
      { name: "reason", label: "Reason", type: "textarea", full: true },
    ]}
    columns={[
      { key: "note_no", label: "Note No." },
      { key: "date", label: "Date" },
      { key: "party_id", label: "Party", render: (r, lk) => nameOf(lk.parties, r.party_id) },
      {
        key: "category_id",
        label: "Category",
        render: (r, lk) => nameOf(lk["product-categories"], r.category_id),
      },
      { key: "against_invoice", label: "Against Invoice" },
      { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
      { key: "reason", label: "Reason" },
    ]}
  />
);

export default CreditNotes;
