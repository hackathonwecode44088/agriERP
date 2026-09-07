import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import api, { errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { DataTable, PageHeader } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const blank = { name: "", gstin: "", phone: "", email: "", address: "" };

const Companies = () => {
  const { companyId, switchCompany, refresh } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  const load = () => {
    setLoading(true);
    api
      .get("/companies")
      .then(({ data }) => setRows(data))
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    try {
      await api.post("/companies", form);
      toast.success("Company created with its own separate books");
      setOpen(false);
      setForm(blank);
      load();
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div data-testid="companies-page">
      <PageHeader
        title="Companies"
        subtitle="Each company keeps its own products, stock, invoices and ledgers. Parties are shared across the workspace."
        action={
          <Button className="gap-2" data-testid="companies-add-btn" onClick={() => setOpen(true)}>
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
              <span className="flex items-center gap-2">
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
            {[
              ["name", "Company Name"],
              ["gstin", "GSTIN"],
              ["phone", "Phone"],
              ["email", "Email"],
              ["address", "Address"],
            ].map(([k, label]) => (
              <div key={k} className={k === "address" ? "sm:col-span-2" : ""}>
                <Label className="text-xs">{label}</Label>
                <Input
                  data-testid={`companies-field-${k}`}
                  className="mt-1"
                  value={form[k]}
                  onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="companies-cancel-btn">
              Cancel
            </Button>
            <Button onClick={save} data-testid="companies-save-btn">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Companies;
