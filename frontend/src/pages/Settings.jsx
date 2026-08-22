import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import api, { errMsg } from "@/lib/api";
import { PageHeader } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const FIELDS = [
  { name: "name", label: "Company Name" },
  { name: "tagline", label: "Tagline (website hero)" },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email" },
  { name: "gstin", label: "GSTIN" },
  { name: "rate_alert_threshold", label: "Rate Alert Threshold (%)" },
];

const Settings = () => {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/company-profile").then(({ data }) => setForm(data)).catch((e) => toast.error(errMsg(e)));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/company-profile", form);
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
        subtitle="Shown on the public website, invoices, vouchers and ledger statements. The rate alert threshold controls when entry screens warn about an unusual rate."
        action={
          <Button onClick={save} disabled={busy} className="gap-2" data-testid="settings-save-btn">
            <Save className="h-4 w-4" /> {busy ? "Saving..." : "Save Changes"}
          </Button>
        }
      />

      <div className="max-w-3xl border border-border bg-white p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.name}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                data-testid={`settings-field-${f.name}`}
                className="mt-1"
                value={form[f.name] || ""}
                onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Label className="text-xs">Address</Label>
            <Textarea
              data-testid="settings-field-address"
              className="mt-1"
              value={form.address || ""}
              onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">About (website intro)</Label>
            <Textarea
              data-testid="settings-field-about"
              className="mt-1"
              rows={4}
              value={form.about || ""}
              onChange={(e) => setForm((s) => ({ ...s, about: e.target.value }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
