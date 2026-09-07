import { useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarClock,
  Building2,
  FileText,
  Gauge,
  Layers,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Route as RouteIcon,
  Settings,
  Sprout,
  Truck,
  Users,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { group: "Overview", items: [{ to: "/admin/dashboard", label: "Dashboard", icon: Gauge }] },
  {
    group: "Masters",
    items: [
      { to: "/admin/parties", label: "Parties", icon: Users },
      { to: "/admin/companies", label: "Companies", icon: Layers },
      { to: "/admin/categories", label: "Product Categories", icon: Layers },
      { to: "/admin/products", label: "Products", icon: Package },
      { to: "/admin/godowns", label: "Godown / Cold Storage", icon: Warehouse },
    ],
  },
  {
    group: "Trading",
    items: [
      { to: "/admin/purchases", label: "Purchases", icon: Truck },
      { to: "/admin/sales", label: "Sales", icon: ReceiptText },
      { to: "/admin/stock", label: "Stock", icon: Sprout },
      { to: "/admin/lots", label: "Lot Traceability", icon: RouteIcon },
    ],
  },
  {
    group: "Accounts",
    adminOnly: true,
    items: [
      { to: "/admin/ledger", label: "Party Ledger", icon: FileText },
      { to: "/admin/receipts", label: "Payments & Receipts", icon: Wallet },
      { to: "/admin/credit-notes", label: "Credit Notes", icon: ReceiptText },
      { to: "/admin/invoices", label: "Invoices", icon: FileText },
      { to: "/admin/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    group: "Settings",
    adminOnly: true,
    items: [
      { to: "/admin/settings", label: "Company Profile", icon: Settings },
      { to: "/admin/users", label: "Staff Logins", icon: Users },
      { to: "/admin/schedule-history", label: "Schedule History", icon: CalendarClock },
    ],
  },
];

const ADMIN_PATHS = [
  "/admin/ledger",
  "/admin/receipts",
  "/admin/credit-notes",
  "/admin/invoices",
  "/admin/reports",
  "/admin/settings",
  "/admin/users",
  "/admin/schedule-history",
];

const AdminLayout = () => {
  const { user, logout, tenant, companies, companyId, switchCompany } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  if (user === null)
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading workspace...
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;

  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const nav = NAV.filter((g) => isAdmin || !g.adminOnly);
  const blocked = !isAdmin && ADMIN_PATHS.some((p) => location.pathname.startsWith(p));

  const sidebar = (
    <nav className="flex h-full flex-col bg-[#14261D] text-white/90">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <Link to="/admin/dashboard" className="flex items-center gap-2" data-testid="sidebar-logo">
          <Sprout className="h-5 w-5 text-accent" />
          <span className="font-head text-sm font-extrabold uppercase tracking-widest">Potato ERP</span>
        </Link>
        <button className="lg:hidden" onClick={() => setOpen(false)} data-testid="sidebar-close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="border-b border-white/10 px-4 py-3" data-testid="company-switcher">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">
          {tenant?.name || "Workspace"} · {tenant?.plan || "trial"}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-accent" />
          <select
            data-testid="company-select"
            value={companyId || ""}
            onChange={(e) => switchCompany(e.target.value)}
            className="w-full bg-transparent text-sm text-white outline-none"
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
        {nav.map((g) => (
          <div key={g.group} className="mb-5">
            <p className="px-2 pb-2 text-[10px] uppercase tracking-[0.18em] text-white/35">{g.group}</p>
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                onClick={() => setOpen(false)}
                data-testid={`nav-${it.to.split("/").slice(2).join("-")}`}
                className={({ isActive }) =>
                  `mb-0.5 flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-colors duration-200 ${
                    isActive ? "bg-accent text-[#14261D] font-semibold" : "hover:bg-white/10"
                  }`
                }
              >
                <it.icon className="h-4 w-4 shrink-0" />
                {it.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-4 py-3">
        <p className="truncate text-xs text-white/50">{user?.email}</p>
        <p className="text-[10px] uppercase tracking-widest text-accent">{isAdmin ? "Admin" : "Operator"}</p>
        <button
          data-testid="logout-btn"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="mt-2 flex items-center gap-2 text-sm text-white/80 transition-colors duration-200 hover:text-accent"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-[260px] shrink-0 lg:block">
        <div className="fixed h-screen w-[260px]">{sidebar}</div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[270px]">{sidebar}</div>
        </div>
      )}
      <main className="min-w-0 flex-1">
        <header className="flex items-center gap-3 border-b border-border bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} data-testid="sidebar-open">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-head text-sm font-extrabold">Potato ERP</span>
        </header>
        <div className="p-4 sm:p-6 lg:p-8">
          {blocked ? (
            <div data-testid="access-restricted" className="border border-border bg-white p-12 text-center">
              <h1 className="font-head text-2xl font-extrabold">Access restricted</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Accounts, invoices, reports and settings are available to admin users only. Ask your administrator
                if you need access.
              </p>
              <Link
                to="/admin/dashboard"
                className="mt-6 inline-block border border-border px-4 py-2 text-sm transition-colors duration-200 hover:border-primary hover:text-primary"
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
