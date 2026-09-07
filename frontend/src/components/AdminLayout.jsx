import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
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
  User,
  Users,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Logo, LogoMark } from "@/components/Logo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const NAV = [
  { single: true, to: "/admin/dashboard", label: "Dashboard", icon: Gauge },
  {
    key: "masters",
    group: "Masters",
    icon: Layers,
    items: [
      { to: "/admin/parties", label: "Parties", icon: Users, feature: "parties" },
      { to: "/admin/companies", label: "Companies", icon: Building2, adminOnly: true },
      { to: "/admin/categories", label: "Product Categories", icon: Layers, feature: "product-categories" },
      { to: "/admin/products", label: "Products", icon: Package, feature: "products" },
      { to: "/admin/price-lists", label: "Price Lists", icon: Tag, feature: "price-lists" },
      { to: "/admin/godowns", label: "Godown / Cold Storage", icon: Warehouse, feature: "godowns" },
      { to: "/admin/party-merge", label: "Merge Parties", icon: GitMerge, adminOnly: true },
    ],
  },
  {
    key: "transactions",
    group: "Transactions",
    icon: Truck,
    items: [
      { to: "/admin/purchases", label: "Purchases", icon: Truck, feature: "purchases" },
      { to: "/admin/sales", label: "Sales", icon: ReceiptText, feature: "sales" },
      { to: "/admin/receipts", label: "Payments & Receipts", icon: Wallet, feature: "receipts" },
      { to: "/admin/credit-notes", label: "Credit Notes", icon: FileMinus, feature: "credit-notes" },
      { to: "/admin/debit-notes", label: "Debit Notes", icon: FilePlus2, feature: "debit-notes" },
    ],
  },
  {
    key: "inventory",
    group: "Inventory",
    icon: Boxes,
    items: [
      { to: "/admin/stock", label: "Stock", icon: Sprout, feature: "stock" },
      { to: "/admin/lots", label: "Lot Traceability", icon: RouteIcon, feature: "lots" },
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
  { single: true, to: "/admin/reports", label: "Reports", icon: BarChart3, feature: "reports" },
  {
    key: "settings",
    group: "Settings",
    icon: SettingsIcon,
    adminOnly: true,
    items: [
      { to: "/admin/settings", label: "Company Profile", icon: SettingsIcon },
      { to: "/admin/users", label: "Staff Logins", icon: Users },
      { to: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck },
      { to: "/admin/schedule-history", label: "Schedule History", icon: CalendarClock },
    ],
  },
];

const testidFor = (to) => `nav-${to.split("/").slice(2).join("-")}`;

const AdminLayout = () => {
  const { user, logout, tenant, companies, companyId, switchCompany, perms, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({});

  const canSee = (it, groupAdmin) =>
    isAdmin ||
    (!it.adminOnly && !groupAdmin && (!it.feature || (perms?.[it.feature] || []).includes("view")));

  const nav = useMemo(
    () =>
      NAV.map((g) =>
        g.single ? g : { ...g, items: g.items.filter((it) => canSee(it, g.adminOnly)) }
      ).filter((g) => (g.single ? canSee(g, false) : g.items.length > 0)),
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
      isActive
        ? "bg-accent font-semibold text-[#14261D]"
        : "text-white/70 hover:bg-white/10 hover:text-white"
    }`;

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
        <div className="mt-2 flex items-center gap-2 rounded-md bg-white/[0.06] px-2.5 py-2">
          <Building2 className="h-4 w-4 shrink-0 text-accent" />
          <select
            data-testid="company-select"
            value={companyId || ""}
            onChange={(e) => switchCompany(e.target.value)}
            className="w-full cursor-pointer bg-transparent text-sm text-white outline-none"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id} className="text-black">
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {nav.map((g) =>
          g.single ? (
            <NavLink key={g.to} to={g.to} className={navLinkClass} data-testid={testidFor(g.to)}>
              <g.icon className="h-4 w-4 shrink-0" />
              {g.label}
            </NavLink>
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
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
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
              <Link
                to="/admin/settings"
                data-testid="topbar-profile-link"
                className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors duration-200 hover:bg-muted"
              >
                <User className="h-4 w-4" /> Company profile
              </Link>
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
