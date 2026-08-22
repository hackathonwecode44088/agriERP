import { Skeleton } from "@/components/ui/skeleton";

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
    <div>
      <h1 className="font-head text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const StatCard = ({ label, value, sub, icon: Icon, testid, tone = "primary" }) => (
  <div
    data-testid={testid}
    className="rise border border-border bg-white p-5 transition-colors duration-200 hover:border-primary/40"
  >
    <div className="flex items-start justify-between">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      {Icon && <Icon className={`h-4 w-4 text-${tone}`} />}
    </div>
    <p className="mt-3 font-head text-2xl font-extrabold text-foreground">{value}</p>
    {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
  </div>
);

export const DataTable = ({ columns, rows, actions, loading, lookups = {}, testid, footer }) => {
  if (loading)
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );

  return (
    <div className="overflow-x-auto border border-border bg-white">
      <table className="w-full min-w-[720px] text-sm" data-testid={`${testid}-table`}>
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2.5 font-head text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
                  c.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {c.label}
              </th>
            ))}
            {actions && <th className="px-3 py-2.5 text-right text-xs uppercase text-muted-foreground">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (actions ? 1 : 0)}
                className="px-3 py-10 text-center text-sm text-muted-foreground"
                data-testid={`${testid}-empty`}
              >
                No records found.
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr
              key={row.id || i}
              data-testid={`${testid}-row-${row.id || i}`}
              className="border-b border-border/70 transition-colors duration-200 last:border-0 hover:bg-muted/40"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                >
                  {c.render ? c.render(row, lookups) : String(row[c.key] ?? "-") || "-"}
                </td>
              ))}
              {actions && <td className="px-3 py-2.5 text-right">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
    </div>
  );
};

export const nameOf = (list, id) => (list || []).find((x) => x.id === id)?.name || "-";
