import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import api, { errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { DataTable, PageHeader } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const blank = { name: "", email: "", password: "", role: "operator", role_id: "" };

const Users = () => {
  const { user: me } = useAuth();
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [confirmRow, setConfirmRow] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get("/users"), api.get("/roles")])
      .then(([u, r]) => {
        setRows(u.data);
        setRoles(r.data || []);
      })
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    try {
      if (editing) await api.put(`/users/${editing.id}`, form);
      else await api.post("/users", form);
      toast.success(editing ? "Staff account updated" : "Staff account created");
      setOpen(false);
      setForm(blank);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const remove = async (row) => {
    try {
      await api.delete(`/users/${row.id}`);
      toast.success("Account removed");
      setConfirmRow(null);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div data-testid="users-page">
      <PageHeader
        title="Staff Logins"
        subtitle="Admins get every screen. Operators use the entry screens only. Assign a custom role to control access feature-by-feature."
        action={
          <Button
            className="gap-2"
            data-testid="users-add-btn"
            onClick={() => {
              setEditing(null);
              setForm(blank);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Staff
          </Button>
        }
      />

      <DataTable
        testid="users"
        loading={loading}
        rows={rows}
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          {
            key: "role",
            label: "Role",
            render: (r) => {
              const label =
                r.role === "admin"
                  ? "Admin"
                  : r.role === "operator"
                  ? "Operator"
                  : roles.find((x) => x.id === r.role_id)?.name || "Custom Role";
              return (
                <Badge
                  className={`rounded-full ${
                    r.role === "admin"
                      ? "bg-primary/10 text-primary hover:bg-primary/10"
                      : "bg-accent/25 text-accent-foreground hover:bg-accent/25"
                  }`}
                >
                  {label}
                </Badge>
              );
            },
          },
          { key: "created_at", label: "Created", render: (r) => (r.created_at || "").slice(0, 10) },
        ]}
        actions={(row) => (
          <div className="flex justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              data-testid={`users-edit-${row.id}`}
              onClick={() => {
                setEditing(row);
                setForm({ name: row.name || "", email: row.email, password: "", role: row.role, role_id: row.role_id || "" });
                setOpen(true);
              }}
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              disabled={row.id === me?.id}
              data-testid={`users-delete-${row.id}`}
              onClick={() => setConfirmRow(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="font-head">{editing ? "Edit Staff Account" : "Add Staff Account"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                data-testid="users-field-name"
                className="mt-1"
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Email (login)</Label>
              <Input
                data-testid="users-field-email"
                className="mt-1"
                type="email"
                disabled={!!editing}
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select
                value={form.role === "custom" ? form.role_id : form.role}
                onValueChange={(v) =>
                  v === "admin" || v === "operator"
                    ? setForm((s) => ({ ...s, role: v, role_id: "" }))
                    : setForm((s) => ({ ...s, role: "custom", role_id: v }))
                }
              >
                <SelectTrigger data-testid="users-field-role" className="mt-1">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="operator">Operator (entry screens only)</SelectItem>
                  <SelectItem value="admin">Admin (full access)</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} (custom role)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{editing ? "New Password (optional)" : "Password"}</Label>
              <Input
                data-testid="users-field-password"
                className="mt-1"
                type="password"
                value={form.password}
                onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="users-cancel-btn">
              Cancel
            </Button>
            <Button onClick={save} data-testid="users-save-btn">
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!confirmRow} onOpenChange={() => setConfirmRow(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-head">Remove staff login?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmRow?.email} will no longer be able to sign in. Their recorded entries stay intact.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRow(null)} data-testid="users-delete-cancel">
              Cancel
            </Button>
            <Button variant="destructive" data-testid="users-delete-confirm" onClick={() => remove(confirmRow)}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
