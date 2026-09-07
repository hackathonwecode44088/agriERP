import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import api, { errMsg } from "@/lib/api";
import { DataTable, PageHeader } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const FEATURE_LABELS = {
  dashboard: "Dashboard",
  parties: "Parties",
  "product-categories": "Product Categories",
  products: "Products",
  "price-lists": "Price Lists",
  godowns: "Godown / Cold Storage",
  purchases: "Purchases",
  sales: "Sales",
  stock: "Stock",
  lots: "Lot Traceability",
  ledger: "Party Ledger",
  receipts: "Payments & Receipts",
  "credit-notes": "Credit Notes",
  "debit-notes": "Debit Notes",
  invoices: "Invoices",
  reports: "Reports",
};
const OPS = ["view", "create", "edit", "delete"];

const Roles = () => {
  const [rows, setRows] = useState([]);
  const [features, setFeatures] = useState({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [permsState, setPermsState] = useState({});
  const [confirmRow, setConfirmRow] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get("/roles"), api.get("/roles/features")])
      .then(([r, f]) => {
        setRows(r.data);
        setFeatures(f.data.features || {});
      })
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setPermsState({});
    setOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setName(row.name);
    setPermsState(row.permissions || {});
    setOpen(true);
  };

  const toggleOp = (feature, op) => {
    setPermsState((s) => {
      const cur = new Set(s[feature] || []);
      if (cur.has(op)) {
        cur.delete(op);
        if (op === "view") cur.clear();
      } else {
        cur.add(op);
        if (op !== "view") cur.add("view");
      }
      const arr = Array.from(cur);
      const next = { ...s };
      if (arr.length) next[feature] = arr;
      else delete next[feature];
      return next;
    });
  };

  const save = async () => {
    try {
      const payload = { name, permissions: permsState };
      if (editing) await api.put(`/roles/${editing.id}`, payload);
      else await api.post("/roles", payload);
      toast.success(editing ? "Role updated" : "Role created");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const remove = async (row) => {
    try {
      await api.delete(`/roles/${row.id}`);
      toast.success("Role deleted");
      setConfirmRow(null);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div data-testid="roles-page">
      <PageHeader
        title="Roles & Permissions"
        subtitle="Create custom staff roles. Tick exactly which features each role can use and what they can do — view, create, edit or delete."
        action={
          <Button className="gap-2" data-testid="roles-add-btn" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Role
          </Button>
        }
      />
      <DataTable
        testid="roles"
        loading={loading}
        rows={rows}
        columns={[
          { key: "name", label: "Role" },
          {
            key: "permissions",
            label: "Features",
            render: (r) =>
              Object.keys(r.permissions || {}).length ? (
                <span className="flex flex-wrap gap-1">
                  {Object.keys(r.permissions).map((f) => (
                    <Badge key={f} className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                      {FEATURE_LABELS[f] || f}
                    </Badge>
                  ))}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
        ]}
        actions={(row) => (
          <div className="flex justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              data-testid={`roles-edit-${row.id}`}
              onClick={() => openEdit(row)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              data-testid={`roles-delete-${row.id}`}
              onClick={() => setConfirmRow(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="font-head flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {editing ? "Edit Role" : "New Role"}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">Role Name</Label>
            <Input
              data-testid="roles-field-name"
              className="mt-1"
              placeholder="e.g. Accountant, Counter Staff"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="mt-2 border border-border">
            <div className="grid grid-cols-[1fr_repeat(4,60px)] items-center border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Feature</span>
              {OPS.map((op) => (
                <span key={op} className="text-center capitalize">
                  {op}
                </span>
              ))}
            </div>
            {Object.entries(features).map(([f, ops]) => (
              <div
                key={f}
                className="grid grid-cols-[1fr_repeat(4,60px)] items-center border-b border-border/60 px-3 py-2 text-sm"
              >
                <span>{FEATURE_LABELS[f] || f}</span>
                {OPS.map((op) => (
                  <div key={op} className="flex justify-center">
                    {ops.includes(op) ? (
                      <Checkbox
                        data-testid={`roles-perm-${f}-${op}`}
                        checked={(permsState[f] || []).includes(op)}
                        onCheckedChange={() => toggleOp(f, op)}
                      />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="roles-cancel-btn">
              Cancel
            </Button>
            <Button onClick={save} data-testid="roles-save-btn">
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmRow} onOpenChange={() => setConfirmRow(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-head">Delete role?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            "{confirmRow?.name}" will be removed. Staff currently using it must be reassigned first.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRow(null)} data-testid="roles-delete-cancel">
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => remove(confirmRow)} data-testid="roles-delete-confirm">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Roles;
