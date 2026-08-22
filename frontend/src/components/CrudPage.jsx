import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Power, Search } from "lucide-react";
import api, { errMsg, money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, DataTable } from "@/components/Shell";

const emptyFor = (fields, defaults) => {
  const o = { ...defaults };
  fields.forEach((f) => {
    if (o[f.name] === undefined) o[f.name] = f.default ?? "";
  });
  return o;
};

export const CrudPage = ({
  title,
  subtitle,
  endpoint,
  query = {},
  defaults = {},
  fields,
  columns,
  testid,
  soft = true,
  computeAmount = false,
  gst = false,
  rateAlert = null,
  searchKeys = ["name"],
  onChanged,
  filters = [],
}) => {
  const [filterVals, setFilterVals] = useState(
    Object.fromEntries(filters.map((f) => [f.name, "all"]))
  );
  const activeFilters = Object.fromEntries(
    Object.entries(filterVals).filter(([, v]) => v && v !== "all")
  );
  const [rows, setRows] = useState([]);
  const [lookups, setLookups] = useState({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyFor(fields, defaults));
  const [confirmRow, setConfirmRow] = useState(null);
  const [term, setTerm] = useState("");

  const sources = useMemo(
    () => [
      ...new Set(
        [...fields, ...filters]
          .filter((f) => f.optionsFrom)
          .flatMap((f) => (Array.isArray(f.optionsFrom) ? f.optionsFrom : [f.optionsFrom]))
      ),
    ],
    [fields, filters]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/${endpoint}`, { params: { ...query, ...activeFilters } });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [endpoint, JSON.stringify(query), JSON.stringify(activeFilters)]); // eslint-disable-line

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!sources.length) return;
    Promise.all(sources.map((s) => api.get(`/${s}`).catch(() => ({ data: [] })))).then((res) => {
      const next = {};
      sources.forEach((s, i) => (next[s] = res[i].data || []));
      setLookups(next);
    });
  }, [JSON.stringify(sources)]); // eslint-disable-line

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyFor(fields, defaults), ...activeFilters });
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    const f = emptyFor(fields, defaults);
    fields.forEach((fl) => {
      if (row[fl.name] === undefined || row[fl.name] === null) return;
      f[fl.name] = fl.type === "multiselect" ? row[fl.name] : String(row[fl.name]);
    });
    setForm(f);
    setOpen(true);
  };

  const save = async () => {
    const payload = { ...defaults, ...form, ...query };
    try {
      if (editing) await api.put(`/${endpoint}/${editing.id}`, payload);
      else await api.post(`/${endpoint}`, payload);
      toast.success(editing ? "Updated successfully" : "Created successfully");
      setOpen(false);
      load();
      onChanged?.();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const remove = async (row) => {
    try {
      await api.delete(`/${endpoint}/${row.id}`);
      toast.success("Deleted");
      setConfirmRow(null);
      load();
      onChanged?.();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const toggle = async (row) => {
    const payload = { ...row, status: row.status === "closed" ? "active" : "closed" };
    delete payload.id;
    try {
      await api.put(`/${endpoint}/${row.id}`, payload);
      toast.success(payload.status === "closed" ? "Temporarily closed" : "Re-activated");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const amount = useMemo(() => {
    if (!computeAmount) return 0;
    const qty = form.rate_basis === "weight" ? Number(form.weight || 0) : Number(form.bags || 0);
    return qty * Number(form.rate || 0);
  }, [computeAmount, form]);

  const gstRate = Number(form.gst_rate || 0);
  const halfGst = (amount * gstRate) / 200;

  const [stats, setStats] = useState(null);
  const [threshold, setThreshold] = useState(20);

  useEffect(() => {
    if (!rateAlert) return;
    api
      .get("/company-profile")
      .then(({ data }) => setThreshold(Number(data.rate_alert_threshold) || 20))
      .catch(() => {});
  }, [rateAlert]);

  useEffect(() => {
    if (!rateAlert || !open || !form.product_id) {
      setStats(null);
      return;
    }
    api
      .get("/rate-stats", { params: { kind: rateAlert.kind, product_id: form.product_id } })
      .then(({ data }) => setStats(data.count ? data : null))
      .catch(() => setStats(null));
  }, [rateAlert, open, form.product_id]); // eslint-disable-line

  const rateWarning = useMemo(() => {
    const rate = Number(form.rate || 0);
    if (!stats || !rate || !stats.avg_rate) return null;
    const diff = ((rate - stats.avg_rate) / stats.avg_rate) * 100;
    if (Math.abs(diff) < threshold) return null;
    return {
      diff: diff.toFixed(1),
      avg: stats.avg_rate,
      count: stats.count,
      min: stats.min_rate,
      max: stats.max_rate,
      high: diff > 0,
    };
  }, [stats, form.rate]);
  const filtered = rows.filter((r) => {
    if (!term) return true;
    const t = term.toLowerCase();
    return searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(t));
  });

  const optionsFor = (f, values = form) => {
    if (f.options) return f.options;
    const srcs = Array.isArray(f.optionsFrom) ? f.optionsFrom : [f.optionsFrom];
    return srcs.flatMap((s) =>
      (lookups[s] || [])
        .filter((x) => !f.optionsFilterBy || !values?.[f.optionsFilterBy] || x[f.optionsFilterBy] === values[f.optionsFilterBy])
        .map((x) => ({ value: x.id, label: x.name + (x.village ? ` (${x.village})` : "") }))
    );
  };

  return (
    <div data-testid={`${testid}-page`}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <Button data-testid={`${testid}-add-btn`} onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Add New
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        {filters.map((f) => (
          <div key={f.name} className="w-48">
            <Label className="text-xs">{f.label}</Label>
            <Select
              value={filterVals[f.name]}
              onValueChange={(v) => setFilterVals((s) => ({ ...s, [f.name]: v }))}
            >
              <SelectTrigger data-testid={`${testid}-filter-${f.name}`} className="mt-1 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">{f.allLabel || `All ${f.label}`}</SelectItem>
                {optionsFor(f, {}).map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid={`${testid}-search`}
            className="pl-8 bg-white"
            placeholder="Search..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <span className="pb-2 text-xs text-muted-foreground">{filtered.length} records</span>
      </div>

      <DataTable
        testid={testid}
        loading={loading}
        columns={columns}
        rows={filtered}
        lookups={lookups}
        actions={(row) => (
          <div className="flex justify-end gap-1">
            <Button
              data-testid={`${testid}-edit-${row.id}`}
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => openEdit(row)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {soft && (
              <Button
                data-testid={`${testid}-toggle-${row.id}`}
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => toggle(row)}
              >
                <Power className={`h-4 w-4 ${row.status === "closed" ? "text-secondary" : ""}`} />
              </Button>
            )}
            <Button
              data-testid={`${testid}-delete-${row.id}`}
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              onClick={() => setConfirmRow(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="font-head">
              {editing ? `Edit ${title}` : `Add ${title}`}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name} className={f.full ? "sm:col-span-2" : ""}>
                <Label className="text-xs font-medium">{f.label}</Label>
                {f.type === "select" ? (
                  <Select
                    value={form[f.name] ? String(form[f.name]) : ""}
                    onValueChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))}
                  >
                    <SelectTrigger data-testid={`${testid}-field-${f.name}`} className="mt-1">
                      <SelectValue placeholder={`Select ${f.label}`} />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {optionsFor(f).map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : f.type === "multiselect" ? (
                  <div className="mt-1 flex flex-wrap gap-2" data-testid={`${testid}-field-${f.name}`}>
                    {optionsFor(f).map((o) => {
                      const selected = (form[f.name] || []).includes(o.value);
                      return (
                        <button
                          type="button"
                          key={o.value}
                          data-testid={`${testid}-${f.name}-${o.value}`}
                          onClick={() =>
                            setForm((s) => {
                              const cur = s[f.name] || [];
                              return {
                                ...s,
                                [f.name]: selected ? cur.filter((x) => x !== o.value) : [...cur, o.value],
                              };
                            })
                          }
                          className={`border px-3 py-1.5 text-sm transition-colors duration-200 ${
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary"
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                ) : f.type === "textarea" ? (
                  <Textarea
                    data-testid={`${testid}-field-${f.name}`}
                    className="mt-1"
                    value={form[f.name]}
                    onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                  />
                ) : (
                  <Input
                    data-testid={`${testid}-field-${f.name}`}
                    className="mt-1"
                    type={f.type || "text"}
                    value={form[f.name]}
                    onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            {rateWarning && (
              <div
                data-testid={`${testid}-rate-alert`}
                className="sm:col-span-2 border-l-2 border-secondary bg-secondary/10 px-4 py-3"
              >
                <p className="font-head text-sm font-semibold text-secondary">
                  Rate is {Math.abs(rateWarning.diff)}% {rateWarning.high ? "above" : "below"} the recent average
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last {rateWarning.count} entries for this product averaged {money(rateWarning.avg)} (range{" "}
                  {money(rateWarning.min)}–{money(rateWarning.max)}). Double-check before saving.
                </p>
              </div>
            )}
            {computeAmount && (
              <div className="sm:col-span-2 border border-primary/20 bg-primary/5 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Taxable Amount</span>
                  <span
                    data-testid={`${testid}-amount-preview`}
                    className="font-head text-lg font-extrabold text-primary"
                  >
                    {money(amount)}
                  </span>
                </div>
                {gst && gstRate > 0 && (
                  <div className="mt-3 space-y-1 border-t border-primary/15 pt-3 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>CGST @ {gstRate / 2}%</span>
                      <span data-testid={`${testid}-cgst-preview`}>{money(halfGst)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>SGST @ {gstRate / 2}%</span>
                      <span data-testid={`${testid}-sgst-preview`}>{money(halfGst)}</span>
                    </div>
                    <div className="flex justify-between font-head font-extrabold">
                      <span>Invoice Total</span>
                      <span data-testid={`${testid}-total-preview`}>{money(amount + halfGst * 2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid={`${testid}-cancel-btn`}>
              Cancel
            </Button>
            <Button onClick={save} data-testid={`${testid}-save-btn`}>
              {editing ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmRow} onOpenChange={() => setConfirmRow(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-head">Delete record?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the record and any linked ledger entry.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRow(null)} data-testid={`${testid}-delete-cancel`}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              data-testid={`${testid}-delete-confirm`}
              onClick={() => remove(confirmRow)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const StatusBadge = ({ status }) => (
  <Badge
    className={
      status === "closed"
        ? "bg-secondary/15 text-secondary hover:bg-secondary/15 rounded-full"
        : "bg-primary/10 text-primary hover:bg-primary/10 rounded-full"
    }
  >
    {status === "closed" ? "Closed" : "Active"}
  </Badge>
);

export default CrudPage;
