import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import api, { errMsg } from "@/lib/api";
import { validateForm } from "@/lib/validate";
import { PageHeader } from "@/components/Shell";
import { FormField, errorClass } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const FIELDS = [
  { name: "name", label: "Company Name", required: true, minLength: 2 },
  { name: "tagline", label: "Tagline (website hero)" },
  { name: "phone", label: "Phone", required: true, rule: "phone", placeholder: "10-digit mobile" },
  { name: "email", label: "Email", rule: "email" },
  { name: "gstin", label: "GSTIN", rule: "gstin", placeholder: "24ABCDE1234F1Z5" },
  {
    name: "rate_alert_threshold",
    label: "Rate Alert Threshold (%)",
    required: true,
    rule: "percent",
    type: "number",
    hint: "Warn on entry when a rate differs from the recent average by this much.",
  },
  {
    name: "low_stock_threshold",
    label: "Low Stock Threshold (Bags)",
    required: true,
    rule: "nonneg",
    type: "number",
  },
];

const Settings = () => {
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/company-profile").then(({ data }) => setForm(data)).catch((e) => toast.error(errMsg(e)));
  }, []);

  const set = (k) => (e) => {
    setForm((s) => ({ ...s, [k]: e.target.value }));
    setErrors((s) => ({ ...s, [k]: "" }));
  };

  const save = async () => {
    const errs = validateForm(FIELDS, form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setBusy(true);
    try {
      await api.put("/company-profile", { ...form, gstin: String(form.gstin || "").trim().toUpperCase() });
      toast.success("Company profile updated");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <p className="text-sm text-muted-foreground">Loading profile...</p>;

  return (
    <div data-testid="settings-page">
      <PageHeader
        title="Company Profile"
        subtitle="Shown on invoices, vouchers and ledger statements. The rate alert threshold controls when entry screens warn about an unusual rate."
        action={
          <Button
            onClick={save}
            disabled={busy}
            className="h-10 w-full gap-2 sm:w-auto"
            data-testid="settings-save-btn"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {busy ? "Saving..." : "Save Changes"}
          </Button>
        }
      />

      <div className="max-w-3xl rounded-sm border border-border bg-white p-5 sm:p-7">
        <div className="grid gap-5 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <FormField
              key={f.name}
              label={f.label}
              required={f.required}
              error={errors[f.name]}
              hint={f.hint}
              testid={`settings-field-${f.name}`}
            >
              <Input
                data-testid={`settings-field-${f.name}`}
                className={errorClass(errors[f.name])}
                type={f.type || "text"}
                placeholder={f.placeholder}
                value={form[f.name] ?? ""}
                onChange={set(f.name)}
              />
            </FormField>
          ))}
          <FormField label="Address" className="sm:col-span-2">
            <Textarea
              data-testid="settings-field-address"
              value={form.address || ""}
              onChange={set("address")}
            />
          </FormField>
          <FormField label="About (website intro)" className="sm:col-span-2">
            <Textarea
              data-testid="settings-field-about"
              rows={4}
              value={form.about || ""}
              onChange={set("about")}
            />
          </FormField>
        </div>
      </div>
    </div>
  );
};

export default Settings;
