import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Package, Sprout, Tractor, TrendingDown, TrendingUp, Wallet, Warehouse } from "lucide-react";
import api, { money, numFmt } from "@/lib/api";
import { PageHeader, StatCard, DataTable } from "@/components/Shell";
import { SeasonComparison } from "@/components/SeasonComparison";

const Dashboard = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard/summary").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  const c = data?.categories || {};
  const cat = (k) => c[k] || { purchase: {}, sale: {} };

  return (
    <div data-testid="dashboard-page">
      <PageHeader title="Dashboard" subtitle="Business summary across seeds, leno bags and potato trading." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          testid="stat-seeds"
          label="Total Seeds"
          icon={Sprout}
          value={`${numFmt(cat("seeds").purchase.bags)} bags in`}
          sub={`Purchased ${money(cat("seeds").purchase.amount)} · Sold ${money(cat("seeds").sale.amount)}`}
        />
        <StatCard
          testid="stat-potato"
          label="Purchased Potatoes"
          icon={Package}
          value={`${numFmt(cat("potato").purchase.bags)} bags`}
          sub={`${numFmt(cat("potato").purchase.weight)} kg · ${money(cat("potato").purchase.amount)}`}
        />
        <StatCard
          testid="stat-lenobag"
          label="Total Leno Bags"
          icon={Package}
          value={`${numFmt(cat("lenobag").purchase.bags)} in`}
          sub={`Sold ${numFmt(cat("lenobag").sale.bags)} · ${money(cat("lenobag").sale.amount)}`}
        />
        <StatCard
          testid="stat-balance"
          label="Farmer Net Balance"
          icon={Wallet}
          value={data?.farmer_balance === null ? "Admin only" : money(data?.farmer_balance)}
          sub="Debit minus credit across all farmer ledgers"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testid="stat-vendors" label="Vendors" icon={Building2} value={numFmt(data?.counts?.vendors)} />
        <StatCard testid="stat-farmers" label="Farmers" icon={Tractor} value={numFmt(data?.counts?.farmers)} />
        <StatCard testid="stat-companies" label="Companies" icon={Building2} value={numFmt(data?.counts?.companies)} />
        <StatCard testid="stat-godowns" label="Godowns" icon={Warehouse} value={numFmt(data?.counts?.godowns)} />
      </div>

      <SeasonComparison />

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
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
              { key: "category", label: "Category" },
              { key: "bags", label: "Bags", align: "right" },
              { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
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
              { key: "category", label: "Category" },
              { key: "bags", label: "Bags", align: "right" },
              { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
            ]}
          />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {[
          { to: "/admin/purchases/potato", label: "New Potato Purchase" },
          { to: "/admin/sales/potato", label: "Sell Potato to Company" },
          { to: "/admin/ledger", label: "Open Farmer Ledger" },
          { to: "/admin/reports", label: "View Reports" },
        ].map((q) => (
          <Link
            key={q.to}
            to={q.to}
            data-testid={`quick-${q.to.split("/").pop()}`}
            className="border border-border bg-white px-4 py-2 text-sm transition-colors duration-200 hover:border-primary hover:text-primary"
          >
            {q.label}
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
