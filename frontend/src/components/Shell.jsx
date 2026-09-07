import { Skeleton } from "@/components/ui/skeleton";

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="mb-6 flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
    <div className="min-w-0">
      <h1 className="font-head text-2xl font-extrabold tracking-tight text-foreground sm:text-[28px]">
        {title}
      </h1>
      {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

const TONES = {
  primary: "text-primary",
  secondary: "text-secondary",
  accent: "text-accent",
};

export const StatCard = ({ label, value, sub, icon: Icon, testid, tone = "primary" }) => (
  <div
    data-testid={testid}
    className="rise flex flex-col justify-between rounded-sm border border-border bg-white p-5 transition-colors duration-200 hover:border-primary/40"
  >
    <div className="flex items-start justify-between gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {Icon && <Icon className={`h-4 w-4 shrink-0 ${TONES[tone] || TONES.primary}`} />}
    </div>
    <p className="mt-3 font-head text-2xl font-extrabold tabular-nums text-foreground">{value}</p>
    {sub && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{sub}</p>}
  </div>
);

export const DataTable = ({ columns, rows = [], actions, loading, lookups = {}, testid, footer }) => {
  if (loading)
    return (
      <div className="space-y-2" data-testid={`${testid}-loading`}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );

  return (
    <div className="w-full max-w-full overflow-x-auto rounded-sm border border-border bg-white">
      <table className="w-full min-w-[720px] text-sm" data-testid={`${testid}-table`}>
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-border bg-muted/70">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`whitespace-nowrap px-3.5 py-3 font-head text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground ${
                  c.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {c.label}
              </th>
            ))}
            {actions && (
              <th className="whitespace-nowrap px-3.5 py-3 text-right font-head text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (actions ? 1 : 0)}
                className="px-3.5 py-12 text-center text-sm text-muted-foreground"
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
                  className={`px-3.5 py-3 align-middle ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                >
                  {c.render ? c.render(row, lookups) : String(row[c.key] ?? "-") || "-"}
                </td>
              ))}
              {actions && <td className="px-3.5 py-3 text-right">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
    </div>
  );
};

export const SectionTitle = ({ icon: Icon, children, className = "" }) => (
  <h2
    className={`font-head mb-3 mt-8 flex items-center gap-2 text-base font-extrabold tracking-tight md:text-lg ${className}`}
  >
    {Icon && <Icon className="h-4 w-4 text-secondary" />}
    {children}
  </h2>
);

export const nameOf = (list, id) => (list || []).find((x) => x.id === id)?.name || "-";
