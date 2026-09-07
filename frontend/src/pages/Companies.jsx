import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import api, { errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { validateForm } from "@/lib/validate";
import { DataTable, PageHeader } from "@/components/Shell";
import { FormField, errorClass } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const blank = { name: "", gstin: "", phone: "", email: "", address: "" };

const SPEC = [
  { name: "name", label: "Company Name", required: true, minLength: 2, full: false },
  { name: "gstin", label: "GSTIN", rule: "gstin", placeholder: "24ABCDE1234F1Z5" },
  { name: "phone", label: "Phone", required: true, rule: "phone", placeholder: "10-digit mobile" },
  { name: "email", label: "Email", rule: "email" },
  { name: "address", label: "Address", type: "textarea", full: true },
];

const Companies = () => {
  const { companyId, switchCompany, refresh } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get("/companies")
      .then(({ data }) => setRows(data))
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (k) => (e) => {
    setForm((s) => ({ ...s, [k]: e.target.value }));
    setErrors((s) => ({ ...s, [k]: "" }));
  };

  const save = async () => {
    const errs = validateForm(SPEC, form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      await api.post("/companies", { ...form, gstin: form.gstin.trim().toUpperCase() });
      toast.success("Company created with its own separate books");
      setOpen(false);
      setForm(blank);
      load();
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="companies-page">
      <PageHeader
        title="Companies"
        subtitle="Each company keeps its own products, stock, invoices and ledgers. Parties are shared across the business."
        action={
          <Button className="h-10 w-full gap-2 sm:w-auto" data-testid="companies-add-btn" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add Company
          </Button>
        }
      />

      <DataTable
        testid="companies"
        loading={loading}
        rows={rows}
        columns={[
          {
            key: "name",
            label: "Company",
            render: (r) => (
              <span className="flex flex-wrap items-center gap-2">
                {r.name}
                {r.id === companyId && (
                  <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">Active</Badge>
                )}
              </span>
            ),
          },
          { key: "gstin", label: "GSTIN" },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
        ]}
        actions={(row) => (
          <Button
            size="sm"
            variant="outline"
            disabled={row.id === companyId}
            data-testid={`companies-switch-${row.id}`}
            onClick={() => switchCompany(row.id)}
          >
            {row.id === companyId ? "Current" : "Switch"}
          </Button>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="font-head">Add Company</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {SPEC.map((f) => (
              <FormField
                key={f.name}
                label={f.label}
                required={f.required}
                error={errors[f.name]}
                className={f.full ? "sm:col-span-2" : ""}
                testid={`companies-field-${f.name}`}
              >
                {f.type === "textarea" ? (
                  <Textarea
                    data-testid={`companies-field-${f.name}`}
                    className={errorClass(errors[f.name])}
                    value={form[f.name]}
                    onChange={set(f.name)}
                  />
                ) : (
                  <Input
                    data-testid={`companies-field-${f.name}`}
                    className={errorClass(errors[f.name])}
                    placeholder={f.placeholder}
                    value={form[f.name]}
                    onChange={set(f.name)}
                  />
                )}
              </FormField>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="companies-cancel-btn">
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="gap-2" data-testid="companies-save-btn">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Companies;
