import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api, { money, numFmt } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export const SeasonChart = () => {
  const [data, setData] = useState(null);
  const [compare, setCompare] = useState(false);

  useEffect(() => {
    api.get("/dashboard/season-chart").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <div className="mt-8" data-testid="season-chart">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-head flex items-center gap-2 text-base font-extrabold md:text-lg">
          <BarChart3 className="h-4 w-4 text-secondary" /> Month-by-month · Season {data.season}
        </h2>
        <button
          data-testid="season-chart-compare-toggle"
          onClick={() => setCompare((c) => !c)}
          className={`border px-3 py-1.5 text-xs transition-colors duration-200 ${
            compare ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary"
          }`}
        >
          {compare ? "Hide last season" : "Compare last season"}
        </button>
      </div>
      <div className="border border-border bg-white p-4 pt-6">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.months} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis
              tickFormatter={(v) => `${v / 1000}k`}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={44}
            />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 2 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="purchases" name="Purchases" fill="hsl(150 37% 26%)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="sales" name="Sales" fill="hsl(41 73% 66%)" radius={[2, 2, 0, 0]} />
            {compare && (
              <Line type="monotone" dataKey="prev_purchases" name="Purchases (last season)" stroke="hsl(150 37% 26%)" strokeDasharray="4 3" dot={false} />
            )}
            {compare && (
              <Line type="monotone" dataKey="prev_sales" name="Sales (last season)" stroke="hsl(26 53% 52%)" strokeDasharray="4 3" dot={false} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const LowStockPanel = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard/low-stock").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data || (data.products.length === 0 && data.lots.length === 0)) return null;

  const pill = (state) => (
    <Badge
      className={`rounded-full ${
        state === "out"
          ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
          : "bg-accent/25 text-accent-foreground hover:bg-accent/25"
      }`}
    >
      {state === "out" ? "Sold out" : "Running low"}
    </Badge>
  );

  return (
    <div className="mt-8" data-testid="low-stock-panel">
      <h2 className="font-head mb-3 flex items-center gap-2 text-base font-extrabold md:text-lg">
        <AlertTriangle className="h-4 w-4 text-secondary" /> Low Stock Warnings
      </h2>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="border border-border bg-white">
          <p className="border-b border-border px-4 py-2.5 text-xs uppercase tracking-widest text-muted-foreground">
            Products at or below {numFmt(data.threshold)} bags
          </p>
          <ul>
            {data.products.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">All products healthy.</li>
            )}
            {data.products.map((p) => (
              <li
                key={p.product_id}
                data-testid={`low-stock-product-${p.product_id}`}
                className="flex items-center justify-between border-b border-border/70 px-4 py-2.5 text-sm last:border-0"
              >
                <span>
                  {p.product} <span className="text-xs text-muted-foreground">· {p.category}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{numFmt(p.balance_bags)} bags left</span>
                  {pill(p.state)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border border-border bg-white">
          <p className="border-b border-border px-4 py-2.5 text-xs uppercase tracking-widest text-muted-foreground">
            Potato lots nearly cleared
          </p>
          <ul>
            {data.lots.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">No lots running low.</li>
            )}
            {data.lots.map((l) => (
              <li
                key={l.lot_no}
                data-testid={`low-stock-lot-${l.lot_no}`}
                className="flex items-center justify-between border-b border-border/70 px-4 py-2.5 text-sm last:border-0"
              >
                <span>
                  Lot {l.lot_no}{" "}
                  <span className="text-xs text-muted-foreground">· {numFmt(l.in_bags)} bags in</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{numFmt(l.balance_bags)} left</span>
                  {pill(l.state)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
