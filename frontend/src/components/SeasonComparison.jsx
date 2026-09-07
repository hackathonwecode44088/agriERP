import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarRange } from "lucide-react";
import api, { money, numFmt } from "@/lib/api";

const Delta = ({ value }) => {
  if (value === null || value === undefined)
    return <span className="text-xs text-muted-foreground">no prior data</span>;
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        up ? "text-primary" : "text-destructive"
      }`}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value)}%
    </span>
  );
};

const Row = ({ label, current, previous, delta, format = money }) => (
  <tr className="border-b border-border/70 last:border-0">
    <td className="px-3 py-2.5 text-sm">{label}</td>
    <td className="px-3 py-2.5 text-right tabular-nums font-head font-extrabold">{format(current)}</td>
    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{format(previous)}</td>
    <td className="px-3 py-2.5 text-right">
      <Delta value={delta} />
    </td>
  </tr>
);

export const SeasonComparison = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard/seasons").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data) return null;
  const { current, previous, growth } = data;

  return (
    <div className="mt-8" data-testid="season-comparison">
      <h2 className="font-head mb-3 flex items-center gap-2 text-base font-extrabold md:text-lg">
        <CalendarRange className="h-4 w-4 text-secondary" /> Season Comparison
      </h2>
      <div className="w-full max-w-full overflow-x-auto border border-border bg-white">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 text-left">Metric</th>
              <th className="px-3 py-2.5 text-right" data-testid="season-current-label">
                {current.label} (current)
              </th>
              <th className="px-3 py-2.5 text-right" data-testid="season-previous-label">
                {previous.label}
              </th>
              <th className="px-3 py-2.5 text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            <Row
              label="Purchases"
              current={current.purchase.amount}
              previous={previous.purchase.amount}
              delta={growth.purchase_amount}
            />
            <Row
              label="Sales"
              current={current.sale.amount}
              previous={previous.sale.amount}
              delta={growth.sale_amount}
            />
            <Row label="Margin" current={current.margin} previous={previous.margin} delta={growth.margin} />
            <Row
              label="Bags purchased"
              current={current.purchase.bags}
              previous={previous.purchase.bags}
              delta={growth.purchase_bags}
              format={numFmt}
            />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Season runs 1 November – 31 October ({current.from} to {current.to}).
      </p>
    </div>
  );
};
