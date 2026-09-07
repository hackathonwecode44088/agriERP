import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api, { errMsg, money, numFmt } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { DataTable, PageHeader, StatCard } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Platform = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState(null);
  const [plans, setPlans] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ plan: "trial", status: "active", plan_expires: "" });

  const load = () => {
    api.get("/platform/tenants").then(({ data }) => setTenants(data)).catch((e) => toast.error(errMsg(e)));
    api.get("/platform/stats").then(({ data }) => setStats(data)).catch(() => {});
    api.get("/platform/plans").then(({ data }) => setPlans(data)).catch(() => {});
  };

  useEffect(load, []);

  const save = async () => {
    try {
      await api.put(`/platform/tenants/${editing.id}`, form);
      toast.success("Subscription updated");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const suspendToggle = async (t) => {
    try {
      await api.put(`/platform/tenants/${t.id}`, { status: t.status === "suspended" ? "active" : "suspended" });
      toast.success(t.status === "suspended" ? "Workspace reactivated" : "Workspace suspended");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  if (user && user !== false && user.role !== "superadmin")
    return <p className="p-10 text-sm text-muted-foreground">Platform admin access only.</p>;

  return (
    <div className="min-h-screen bg-background" data-testid="platform-page">
      <header className="flex items-center justify-between border-b border-border bg-[#14261D] px-6 py-4 text-white">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <span className="font-head text-sm font-extrabold uppercase tracking-widest">Platform Console</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-white/60">
          <span>{user?.email}</span>
          <button
            data-testid="platform-logout"
            className="flex items-center gap-1 hover:text-accent"
            onClick={async () => {
              await logout();
              navigate("/");
            }}
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </header>

      <div className="p-6 lg:p-8">
        <PageHeader
          title="Subscriptions"
          subtitle="Every customer workspace, its plan and usage. Suspending a workspace blocks its data instantly."
          action={
            <Button variant="outline" className="gap-2" data-testid="platform-refresh" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          }
        />

        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard testid="platform-tenants" label="Workspaces" value={numFmt(stats?.tenants)} icon={Building2} />
          <StatCard testid="platform-active" label="Active" value={numFmt(stats?.active)} />
          <StatCard testid="platform-trials" label="On Trial" value={numFmt(stats?.trials)} />
          <StatCard testid="platform-users" label="Users" value={numFmt(stats?.users)} />
          <StatCard testid="platform-mrr" label="Monthly Revenue" value={money(stats?.mrr)} />
        </div>

        <DataTable
          testid="platform"
          rows={tenants}
          loading={!tenants}
          columns={[
            { key: "name", label: "Workspace" },
            { key: "owner_email", label: "Owner" },
            {
              key: "plan",
              label: "Plan",
              render: (r) => (
                <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                  {r.plan_label || r.plan}
                </Badge>
              ),
            },
            { key: "plan_expires", label: "Renews / Expires" },
            {
              key: "status",
              label: "Status",
              render: (r) => (
                <Badge
                  className={`rounded-full ${
                    r.status === "suspended"
                      ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
                      : "bg-primary/10 text-primary hover:bg-primary/10"
                  }`}
                >
                  {r.status}
                </Badge>
              ),
            },
            { key: "companies", label: "Companies", align: "right" },
            { key: "users", label: "Users", align: "right" },
            { key: "parties", label: "Parties", align: "right" },
            { key: "sales", label: "Sales", align: "right" },
          ]}
          actions={(row) => (
            <div className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="outline"
                data-testid={`platform-edit-${row.id}`}
                onClick={() => {
                  setEditing(row);
                  setForm({ plan: row.plan, status: row.status, plan_expires: row.plan_expires || "" });
                }}
              >
                Plan
              </Button>
              <Button
                size="sm"
                variant={row.status === "suspended" ? "outline" : "destructive"}
                data-testid={`platform-suspend-${row.id}`}
                onClick={() => suspendToggle(row)}
              >
                {row.status === "suspended" ? "Reactivate" : "Suspend"}
              </Button>
            </div>
          )}
        />

        <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="font-head">Subscription · {editing?.name}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div>
                <Label className="text-xs">Plan</Label>
                <Select value={form.plan} onValueChange={(v) => setForm((s) => ({ ...s, plan: v }))}>
                  <SelectTrigger data-testid="platform-field-plan" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {plans.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label} — ₹{p.price}/mo · {p.max_companies} companies · {p.max_users} users
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((s) => ({ ...s, status: v }))}>
                  <SelectTrigger data-testid="platform-field-status" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Renews / expires on</Label>
                <Input
                  data-testid="platform-field-expires"
                  type="date"
                  className="mt-1"
                  value={form.plan_expires}
                  onChange={(e) => setForm((s) => ({ ...s, plan_expires: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)} data-testid="platform-cancel">
                Cancel
              </Button>
              <Button onClick={save} data-testid="platform-save">
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Platform;
