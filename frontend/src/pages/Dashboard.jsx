import { useEffect, useState } from "react";
import { Building2, Boxes, Layers, Package, Tractor, TrendingDown, TrendingUp, Users, Wallet, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import api, { money, numFmt } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, StatCard, DataTable } from "@/components/Shell";
import { SeasonComparison } from "@/components/SeasonComparison";
import { LowStockPanel, ReorderPanel, SeasonChart } from "@/components/DashboardInsights";

const QUICK = [
  { to: "/admin/purchases", label: "New Purchase", icon: Boxes, feature: "purchases" },
  { to: "/admin/sales", label: "New Sale", icon: Building2, feature: "sales" },
  { to: "/admin/parties", label: "Add Party", icon: Tractor, feature: "parties" },
  { to: "/admin/ledger", label: "Open Party Ledger", icon: Wallet, feature: "ledger" },
];

const Dashboard = () => {
  const { can } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard/summary").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  const cats = data?.categories || [];
  const block = (b) => can("dashboard", b);
  const quick = QUICK.filter((q) => can(q.feature));

  return (
    <div data-testid="dashboard-page">
      <PageHeader title="Dashboard" subtitle="Business summary across every product category and party." />

      <div className="grid min-w-0 gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
        {block("receivable") && (
          <StatCard
            testid="stat-receivable"
            label="Total Receivable"
            icon={Wallet}
            value={data?.receivable === null ? "Restricted" : money(data?.receivable)}
            sub="Parties who owe you"
          />
        )}
        {block("payable") && (
          <StatCard
            testid="stat-payable"
            label="Total Payable"
            icon={Wallet}
            value={data?.payable === null ? "Restricted" : money(data?.payable)}
            sub="What you owe parties"
          />
        )}
        {block("counts") && (
          <>
            <StatCard
              testid="stat-parties"
              label="Parties"
              icon={Users}
              value={numFmt(data?.counts?.parties)}
              sub={`${numFmt(data?.counts?.farmers)} farmers · ${numFmt(data?.counts?.vendors)} vendors · ${numFmt(data?.counts?.customers)} customers`}
            />
            <StatCard
              testid="stat-products"
              label="Products"
              icon={Package}
              value={numFmt(data?.counts?.products)}
              sub={`${numFmt(data?.counts?.categories)} categories · ${numFmt(data?.counts?.godowns)} godowns`}
            />
          </>
        )}
      </div>

      {block("quick-actions") && quick.length > 0 && (
        <div className="mt-6" data-testid="quick-actions">
          <h2 className="font-head mb-3 flex items-center gap-2 text-base font-extrabold md:text-lg">
            <Zap className="h-4 w-4 text-secondary" /> Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            {quick.map((q) => (
              <Link
                key={q.to}
                to={q.to}
                data-testid={`quick-${q.to.split("/").pop()}`}
                className="flex flex-1 items-center gap-2 rounded-sm border border-border bg-white px-4 py-3 text-sm transition-colors duration-200 hover:border-primary hover:text-primary sm:flex-none"
              >
                <q.icon className="h-4 w-4" /> {q.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {block("category-summary") && (
        <>
          <h2 className="font-head mb-3 mt-8 flex items-center gap-2 text-base font-extrabold md:text-lg">
            <Layers className="h-4 w-4 text-secondary" /> Category Summary
          </h2>
          <DataTable
            testid="category-summary"
            loading={!data}
            rows={cats}
            columns={[
              { key: "name", label: "Category" },
              { key: "pb", label: "Bags In", align: "right", render: (r) => numFmt(r.purchase.bags) },
              { key: "pa", label: "Purchased", align: "right", render: (r) => money(r.purchase.amount) },
              { key: "sb", label: "Bags Out", align: "right", render: (r) => numFmt(r.sale.bags) },
              { key: "sa", label: "Sold", align: "right", render: (r) => money(r.sale.amount) },
              {
                key: "margin",
                label: "Margin",
                align: "right",
                render: (r) => (
                  <span className={r.sale.amount - r.purchase.amount >= 0 ? "text-primary" : "text-destructive"}>
                    {money(r.sale.amount - r.purchase.amount)}
                  </span>
                ),
              },
            ]}
          />
        </>
      )}

      {block("season") && (
        <>
          <SeasonComparison />
          <SeasonChart />
        </>
      )}
      {block("low-stock") && <LowStockPanel />}
      {block("reorder") && <ReorderPanel />}

      {block("recent") && (
        <div className="mt-8 grid min-w-0 gap-6 [&>*]:min-w-0 xl:grid-cols-2">
          <div>
            <h2 className="font-head mb-3 flex items-center gap-2 text-base font-extrabold md:text-lg">
              <TrendingDown className="h-4 w-4 text-secondary" /> Recent Purchases
            </h2>
            <DataTable
              testid="recent-purchases"
              rows={data?.recent_purchases || []}
              loading={!data}
              columns={[
                { key: "invoice_no", label: "No." },
                { key: "date", label: "Date" },
                { key: "bags", label: "Bags", align: "right" },
                { key: "total_amount", label: "Total", align: "right", render: (r) => money(r.total_amount ?? r.amount) },
              ]}
            />
          </div>
          <div>
            <h2 className="font-head mb-3 flex items-center gap-2 text-base font-extrabold md:text-lg">
              <TrendingUp className="h-4 w-4 text-primary" /> Recent Sales
            </h2>
            <DataTable
              testid="recent-sales"
              rows={data?.recent_sales || []}
              loading={!data}
              columns={[
                { key: "invoice_no", label: "Invoice" },
                { key: "date", label: "Date" },
                { key: "bags", label: "Bags", align: "right" },
                { key: "total_amount", label: "Total", align: "right", render: (r) => money(r.total_amount ?? r.amount) },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
