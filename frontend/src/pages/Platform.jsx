import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  CircleDollarSign,
  LayoutGrid,
  Loader2,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api, { errMsg, money, numFmt } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { validateForm } from "@/lib/validate";
import { DataTable, PageHeader, StatCard } from "@/components/Shell";
import { Logo, LogoMark } from "@/components/Logo";
import { FormField, errorClass } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SECTIONS = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "businesses", label: "Businesses", icon: Building2 },
  { key: "plans", label: "Plans", icon: CircleDollarSign },
];

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

const SPEC = [
  { name: "plan", label: "Plan", required: true },
  { name: "status", label: "Status", required: true },
  { name: "plan_expires", label: "Renews / expires on", required: true, rule: "date" },
];

const Platform = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState("overview");
  const [navOpen, setNavOpen] = useState(false);
  const [tenants, setTenants] = useState(null);
  const [stats, setStats] = useState(null);
  const [plans, setPlans] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ plan: "trial", status: "active", plan_expires: "" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [term, setTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    Promise.all([
      api.get("/platform/tenants").then(({ data }) => setTenants(data)),
      api.get("/platform/stats").then(({ data }) => setStats(data)).catch(() => {}),
      api.get("/platform/plans").then(({ data }) => setPlans(data)).catch(() => {}),
    ])
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setRefreshing(false));
  };

  useEffect(load, []);

  const save = async () => {
    const errs = validateForm(SPEC, form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/platform/tenants/${editing.id}`, form);
      toast.success("Subscription updated");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const suspendToggle = async (t) => {
    try {
      await api.put(`/platform/tenants/${t.id}`, { status: t.status === "suspended" ? "active" : "suspended" });
      toast.success(t.status === "suspended" ? "Business reactivated" : "Business suspended");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const filtered = useMemo(() => {
    const list = tenants || [];
    const t = term.trim().toLowerCase();
    return list.filter(
      (r) =>
        (statusFilter === "all" || r.status === statusFilter) &&
        (!t ||
          String(r.name || "").toLowerCase().includes(t) ||
          String(r.owner_email || "").toLowerCase().includes(t))
    );
  }, [tenants, term, statusFilter]);

  if (user === null)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <LogoMark className="h-10 w-10 animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading platform console...</p>
      </div>
    );

  if (user && user !== false && user.role !== "superadmin")
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm rounded-sm border border-border bg-white p-10 text-center" data-testid="platform-denied">
          <ShieldCheck className="mx-auto h-8 w-8 text-secondary" />
          <h1 className="mt-4 font-head text-xl font-extrabold">Platform admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">This console is restricted to AgriERP staff.</p>
        </div>
      </div>
    );

  const sidebar = (
    <nav className="flex h-full flex-col bg-[#14261D]">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <Logo tone="dark" markClass="h-8 w-8" subtitle="Platform" />
        <button
          className="rounded-md p-1.5 text-white/70 hover:bg-white/10 lg:hidden"
          onClick={() => setNavOpen(false)}
          data-testid="platform-nav-close"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 px-3 py-4">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            data-testid={`platform-nav-${s.key}`}
            onClick={() => {
              setSection(s.key);
              setNavOpen(false);
            }}
            className={`mb-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-200 ${
              section === s.key
                ? "bg-accent font-semibold text-[#14261D]"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <s.icon className="h-4 w-4" /> {s.label}
          </button>
        ))}
      </div>
      <div className="border-t border-white/10 px-4 py-4">
        <p className="truncate text-xs text-white/60">{user?.email}</p>
        <p className="text-[10px] uppercase tracking-widest text-accent">Super Admin</p>
        <button
          data-testid="platform-logout"
          className="mt-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-accent"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </nav>
  );

  const businessesTable = (
    <DataTable
      testid="platform"
      rows={filtered}
      loading={tenants === null}
      columns={[
        { key: "name", label: "Business" },
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
              setErrors({});
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
  );

  return (
    <div className="flex min-h-screen bg-background" data-testid="platform-page">
      <aside className="hidden w-[240px] shrink-0 lg:block">
        <div className="fixed h-screen w-[240px]">{sidebar}</div>
      </aside>
      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[84%] max-w-[280px] shadow-2xl">{sidebar}</div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            onClick={() => setNavOpen(true)}
            data-testid="platform-nav-open"
            aria-label="Open menu"
            className="rounded-md p-2 transition-colors duration-200 hover:bg-muted lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:block">
              AgriERP Platform Console
            </p>
            <h2 className="truncate font-head text-base font-extrabold tracking-tight">
              {SECTIONS.find((s) => s.key === section)?.label}
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            data-testid="platform-refresh"
            disabled={refreshing}
            onClick={load}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </header>

        <div className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {section === "overview" && (
            <>
              <PageHeader
                title="Platform Overview"
                subtitle="Live snapshot of every customer business on AgriERP."
              />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard testid="platform-tenants" label="Businesses" value={numFmt(stats?.tenants)} icon={Building2} />
                <StatCard testid="platform-active" label="Active" value={numFmt(stats?.active)} icon={ShieldCheck} />
                <StatCard testid="platform-trials" label="On Trial" value={numFmt(stats?.trials)} tone="secondary" />
                <StatCard testid="platform-users" label="Users" value={numFmt(stats?.users)} icon={Users} />
                <StatCard
                  testid="platform-mrr"
                  label="Monthly Revenue"
                  value={money(stats?.mrr)}
                  icon={CircleDollarSign}
                />
              </div>
              <h3 className="font-head mb-3 mt-8 text-base font-extrabold md:text-lg">Recently added</h3>
              <DataTable
                testid="platform-recent"
                loading={tenants === null}
                rows={(tenants || []).slice(0, 5)}
                columns={[
                  { key: "name", label: "Business" },
                  { key: "owner_email", label: "Owner" },
                  { key: "plan", label: "Plan", render: (r) => r.plan_label || r.plan },
                  { key: "status", label: "Status" },
                  { key: "users", label: "Users", align: "right" },
                ]}
              />
            </>
          )}

          {section === "businesses" && (
            <>
              <PageHeader
                title="Businesses"
                subtitle="Every customer business, its plan and usage. Suspending a business blocks its data instantly."
              />
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div className="w-full sm:w-48">
                  <p className="text-xs font-semibold text-foreground/80">Status</p>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="mt-1.5 bg-white" data-testid="platform-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {STATUS_FILTERS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    data-testid="platform-search"
                    className="bg-white pl-8"
                    placeholder="Search business or owner..."
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                  />
                </div>
                <span className="pb-2 text-xs text-muted-foreground">{filtered.length} businesses</span>
              </div>
              {businessesTable}
            </>
          )}

          {section === "plans" && (
            <>
              <PageHeader title="Plans" subtitle="Limits applied to every business on that plan." />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {plans.map((p) => (
                  <div
                    key={p.key}
                    data-testid={`platform-plan-${p.key}`}
                    className="rounded-sm border border-border bg-white p-6 transition-colors duration-200 hover:border-primary/40"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {p.label}
                    </p>
                    <p className="mt-2 font-head text-3xl font-extrabold text-primary">
                      ₹{numFmt(p.price)}
                      <span className="text-sm font-medium text-muted-foreground">/mo</span>
                    </p>
                    <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                      <li>{p.max_companies} companies</li>
                      <li>{p.max_users} staff logins</li>
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-head">Subscription · {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <FormField label="Plan" required error={errors.plan} testid="platform-field-plan">
              <Select
                value={form.plan}
                onValueChange={(v) => {
                  setForm((s) => ({ ...s, plan: v }));
                  setErrors((s) => ({ ...s, plan: "" }));
                }}
              >
                <SelectTrigger data-testid="platform-field-plan" className={errorClass(errors.plan)}>
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
            </FormField>
            <FormField label="Status" required error={errors.status} testid="platform-field-status">
              <Select value={form.status} onValueChange={(v) => setForm((s) => ({ ...s, status: v }))}>
                <SelectTrigger data-testid="platform-field-status" className={errorClass(errors.status)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Renews / expires on"
              required
              error={errors.plan_expires}
              testid="platform-field-expires"
            >
              <Input
                data-testid="platform-field-expires"
                type="date"
                className={errorClass(errors.plan_expires)}
                value={form.plan_expires}
                onChange={(e) => {
                  setForm((s) => ({ ...s, plan_expires: e.target.value }));
                  setErrors((s) => ({ ...s, plan_expires: "" }));
                }}
              />
            </FormField>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} data-testid="platform-cancel">
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="gap-2" data-testid="platform-save">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Platform;
