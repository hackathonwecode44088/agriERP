import CrudPage from "@/components/CrudPage";
import { money } from "@/lib/api";
import { nameOf } from "@/components/Shell";

const TODAY = new Date().toISOString().slice(0, 10);

const DebitNotes = () => (
  <CrudPage
    testid="debit-notes"
    title="Debit Note"
    subtitle="Extra charges or adjustments that increase what a party owes you. Posts a debit to their ledger."
    endpoint="debit-notes"
    soft={false}
    searchKeys={["note_no", "against_invoice", "reason"]}
    fields={[
      { name: "date", label: "Date", type: "date", default: TODAY },
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

export default DebitNotes;
