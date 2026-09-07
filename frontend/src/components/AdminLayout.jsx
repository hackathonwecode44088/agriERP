import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  FileMinus,
  FilePlus2,
  FileText,
  Gauge,
  GitMerge,
  Layers,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Route as RouteIcon,
  Settings as SettingsIcon,
  ShieldCheck,
  Sprout,
  Tag,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  X,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Logo, LogoMark } from "@/components/Logo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const NAV = [
  { single: true, to: "/admin/dashboard", label: "Dashboard", icon: Gauge, feature: "dashboard" },
  {
    key: "operations",
    group: "Transactions & Inventory",
    icon: Truck,
    pinned: true,
    items: [
      { to: "/admin/purchases", label: "Purchases", icon: Truck, feature: "purchases" },
      { to: "/admin/sales", label: "Sales", icon: ReceiptText, feature: "sales" },
      { to: "/admin/receipts", label: "Payments & Receipts", icon: Wallet, feature: "receipts" },
      { to: "/admin/credit-notes", label: "Credit Notes", icon: FileMinus, feature: "credit-notes" },
      { to: "/admin/debit-notes", label: "Debit Notes", icon: FilePlus2, feature: "debit-notes" },
      { to: "/admin/stock", label: "Stock", icon: Sprout, feature: "stock" },
      { to: "/admin/lots", label: "Lot Traceability", icon: RouteIcon, feature: "lots" },
    ],
  },
  {
    key: "masters",
    group: "Masters",
    icon: Layers,
    items: [
      { to: "/admin/parties", label: "Parties", icon: Users, feature: "parties" },
      { to: "/admin/categories", label: "Product Categories", icon: Layers, feature: "product-categories" },
      { to: "/admin/products", label: "Products", icon: Package, feature: "products" },
      { to: "/admin/godowns", label: "Godown / Cold Storage", icon: Warehouse, feature: "godowns" },
    ],
  },
  {
    key: "accounts",
    group: "Accounts",
    icon: Wallet,
    items: [
      { to: "/admin/ledger", label: "Party Ledger", icon: FileText, feature: "ledger" },
      { to: "/admin/invoices", label: "Invoices", icon: FileText, feature: "invoices" },
    ],
  },
  {
    key: "utilities",
    group: "Utilities",
    icon: Wrench,
    items: [
      { to: "/admin/price-lists", label: "Price Lists", icon: Tag, feature: "price-lists" },
      { to: "/admin/party-merge", label: "Merge Parties", icon: GitMerge, adminOnly: true },
    ],
  },
  { single: true, to: "/admin/reports", label: "Reports", icon: BarChart3, feature: "reports" },
  { single: true, to: "/admin/notifications", label: "Notifications", icon: Bell, feature: "notifications" },
  { single: true, to: "/admin/companies", label: "Companies", icon: Building2, adminOnly: true },
  { single: true, to: "/admin/settings", label: "Company Profile", icon: SettingsIcon, adminOnly: true },
  {
    key: "settings",
    group: "Settings",
    icon: ShieldCheck,
    adminOnly: true,
    items: [
      { to: "/admin/users", label: "Staff Logins", icon: Users },
      { to: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck },
    ],
  },
];

const testidFor = (to) => `nav-${to.split("/").slice(2).join("-")}`;

const CompanySwitcher = ({ companies, companyId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const active = companies.find((c) => c.id === companyId);
  const list = companies.filter((c) => c.name.toLowerCase().includes(term.trim().toLowerCase()));
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        setTerm("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          data-testid="company-select"
          className="mt-2 flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-2.5 py-2 text-left transition-colors duration-200 hover:border-accent/50 hover:bg-white/10"
        >
          <Building2 className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-sm text-white">{active?.name || "Select company"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        style={{ backgroundColor: "#1B3327", borderColor: "rgba(255,255,255,0.12)" }}
        className="w-[240px] overflow-hidden rounded-md p-0 text-white shadow-2xl"
      >
        {companies.length > 4 && (
          <div className="border-b border-white/10 p-2">
            <input
              data-testid="company-search"
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search company..."
              className="w-full rounded-sm bg-white/10 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/40 focus:ring-1 focus:ring-accent/60"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto py-1">
          {list.length === 0 && <p className="py-4 text-center text-xs text-white/50">No company found.</p>}
          {list.map((c) => (
            <button
              key={c.id}
              data-testid={`company-option-${c.id}`}
              onClick={() => {
                setOpen(false);
                if (c.id !== companyId) onSelect(c.id);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-white/10 ${
                c.id === companyId ? "text-accent" : "text-white/85"
              }`}
            >
              <Check className={`h-4 w-4 shrink-0 ${c.id === companyId ? "opacity-100" : "opacity-0"}`} />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const AdminLayout = () => {
  const { user, logout, tenant, companies, companyId, switchCompany, perms, isAdmin, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [notifs, setNotifs] = useState({ items: [], unread: 0 });

  const canSee = (it, groupAdmin) =>
    isAdmin || (!it.adminOnly && !groupAdmin && (!it.feature || (perms?.[it.feature] || []).includes("view")));

  const nav = useMemo(
    () =>
      NAV.map((g) => (g.single ? g : { ...g, items: g.items.filter((it) => canSee(it, g.adminOnly)) })).filter((g) =>
        g.single ? canSee(g, false) : g.items.length > 0
      ),
    // eslint-disable-next-line
    [isAdmin, JSON.stringify(perms)]
  );

  const allItems = useMemo(
    () =>
      NAV.flatMap((g) =>
        g.single ? [{ ...g, groupAdmin: false }] : g.items.map((it) => ({ ...it, groupAdmin: g.adminOnly }))
      ),
    []
  );
  const currentItem = allItems.find((it) => location.pathname.startsWith(it.to));
  const canNotifs = can("notifications");

  const loadNotifs = () =>
    api
      .get("/notifications")
      .then(({ data }) => setNotifs(data))
      .catch(() => {});

  useEffect(() => {
    if (!canNotifs || !user || user === false) return;
    loadNotifs();
    const t = setInterval(loadNotifs, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [canNotifs, user, location.pathname]);

  useEffect(() => {
    const active = NAV.find((g) => !g.single && g.items.some((it) => location.pathname.startsWith(it.to)));
    if (active) setOpenGroups((s) => ({ ...s, [active.key]: true }));
  }, [location.pathname]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (user === null)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <LogoMark className="h-10 w-10 animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading your business...</p>
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;

  const blocked = currentItem ? !canSee(currentItem, currentItem.groupAdmin) : false;
  const roleLabel =
    user?.role === "owner"
      ? "Owner"
      : user?.role === "admin"
        ? "Admin"
        : user?.role === "custom"
          ? "Custom Role"
          : "Operator";

  const navLinkClass = ({ isActive }) =>
    `group mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-200 ${
      isActive ? "bg-accent font-semibold text-[#14261D]" : "text-white/70 hover:bg-white/10 hover:text-white"
    }`;

  const markAllRead = async () => {
    await api.post("/notifications/read-all").catch(() => {});
    loadNotifs();
  };

  const sidebar = (
    <nav className="flex h-full flex-col bg-[#14261D]">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <Link to="/admin/dashboard" data-testid="sidebar-logo" onClick={() => setOpen(false)}>
          <Logo tone="dark" markClass="h-8 w-8" />
        </Link>
        <button
          className="rounded-md p-1.5 text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setOpen(false)}
          data-testid="sidebar-close"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="border-b border-white/10 px-4 py-3.5" data-testid="company-switcher">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
          {tenant?.name || "Business"} · {tenant?.plan || "trial"}
        </p>
        <CompanySwitcher companies={companies} companyId={companyId} onSelect={switchCompany} />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {nav.map((g) =>
          g.single ? (
            <NavLink key={g.to} to={g.to} className={navLinkClass} data-testid={testidFor(g.to)}>
              <g.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{g.label}</span>
              {g.to === "/admin/notifications" && notifs.unread > 0 && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-[#14261D]">
                  {notifs.unread}
                </span>
              )}
            </NavLink>
          ) : g.pinned ? (
            <div key={g.key} className="mb-1" data-testid={`nav-group-${g.key}`}>
              <p className="flex items-center gap-2.5 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                <g.icon className="h-3.5 w-3.5 shrink-0" />
                {g.group}
              </p>
              <div className="ml-3.5 mt-1 border-l border-white/10 pl-2.5">
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to} className={navLinkClass} data-testid={testidFor(it.to)}>
                    <it.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{it.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ) : (
            <div key={g.key} className="mb-1">
              <button
                type="button"
                data-testid={`nav-group-${g.key}`}
                onClick={() => setOpenGroups((s) => ({ ...s, [g.key]: !s[g.key] }))}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 transition-colors duration-200 hover:bg-white/5 hover:text-white/75"
              >
                <g.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{g.group}</span>
                {openGroups[g.key] ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              {openGroups[g.key] && (
                <div className="ml-3.5 mt-1 border-l border-white/10 pl-2.5">
                  {g.items.map((it) => (
                    <NavLink key={it.to} to={it.to} className={navLinkClass} data-testid={testidFor(it.to)}>
                      <it.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{it.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>

      <div className="border-t border-white/10 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 font-head text-xs font-extrabold text-accent">
            {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white/85">{user?.name || user?.email}</p>
            <p className="text-[10px] uppercase tracking-widest text-accent">{roleLabel}</p>
          </div>
        </div>
        <button
          data-testid="logout-btn"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-accent"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-[264px] shrink-0 lg:block">
        <div className="fixed h-screen w-[264px]">{sidebar}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[86%] max-w-[300px] shadow-2xl">{sidebar}</div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-white/90 px-4 backdrop-blur-md sm:gap-3 sm:px-6 lg:px-8">
          <button
            onClick={() => setOpen(true)}
            data-testid="sidebar-open"
            aria-label="Open menu"
            className="rounded-md p-2 transition-colors duration-200 hover:bg-muted lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:block">
              {tenant?.name || "Business"}
            </p>
            <h2 className="truncate font-head text-base font-extrabold tracking-tight" data-testid="topbar-title">
              {currentItem?.label || "Dashboard"}
            </h2>
          </div>

          {canNotifs && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  data-testid="notif-bell"
                  aria-label="Notifications"
                  className="relative rounded-full border border-border bg-white p-2 transition-colors duration-200 hover:border-primary/40"
                >
                  <Bell className="h-4 w-4" />
                  {notifs.unread > 0 && (
                    <span
                      data-testid="notif-unread-badge"
                      className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white"
                    >
                      {notifs.unread}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[320px] bg-white p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <p className="font-head text-sm font-semibold">Notifications</p>
                  {notifs.unread > 0 && (
                    <button
                      data-testid="notif-mark-all"
                      onClick={markAllRead}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifs.items.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid="notif-empty">
                      Nothing new. Notifications clear themselves after 2 days.
                    </p>
                  )}
                  {notifs.items.slice(0, 8).map((n) => (
                    <div
                      key={n.id}
                      data-testid={`notif-item-${n.id}`}
                      className={`border-b border-border/70 px-4 py-2.5 last:border-0 ${n.read ? "" : "bg-primary/[0.04]"}`}
                    >
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {(n.created_at || "").slice(0, 16).replace("T", " ")}
                      </p>
                    </div>
                  ))}
                </div>
                <Link
                  to="/admin/notifications"
                  data-testid="notif-see-all"
                  className="block border-t border-border px-4 py-2.5 text-center text-xs font-semibold text-primary hover:bg-muted"
                >
                  See all notifications
                </Link>
              </PopoverContent>
            </Popover>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <button
                data-testid="topbar-user-btn"
                className="flex items-center gap-2 rounded-full border border-border bg-white py-1 pl-1 pr-3 transition-colors duration-200 hover:border-primary/40"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 font-head text-xs font-extrabold text-primary">
                  {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[140px] truncate text-xs font-medium sm:block">
                  {user?.name || user?.email}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 bg-white p-0">
              <div className="border-b border-border px-4 py-3">
                <p className="truncate font-head text-sm font-semibold">{user?.name || "User"}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-primary">{roleLabel}</p>
              </div>
              {isAdmin && (
                <Link
                  to="/admin/settings"
                  data-testid="topbar-profile-link"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors duration-200 hover:bg-muted"
                >
                  <SettingsIcon className="h-4 w-4" /> Company profile
                </Link>
              )}
              <button
                data-testid="topbar-logout"
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
                className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-sm text-destructive transition-colors duration-200 hover:bg-destructive/5"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </PopoverContent>
          </Popover>
        </header>

        <div className="mx-auto w-full min-w-0 max-w-[1500px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {blocked ? (
            <div
              data-testid="access-restricted"
              className="mx-auto max-w-md rounded-sm border border-border bg-white p-10 text-center"
            >
              <ShieldCheck className="mx-auto h-8 w-8 text-secondary" />
              <h1 className="mt-4 font-head text-xl font-extrabold">Access restricted</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                You don't have permission to view this screen. Ask your administrator if you need access.
              </p>
              <Link
                to="/admin/dashboard"
                className="mt-6 inline-block rounded-sm border border-border px-4 py-2 text-sm transition-colors duration-200 hover:border-primary hover:text-primary"
                data-testid="restricted-back-btn"
              >
                Back to dashboard
              </Link>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
