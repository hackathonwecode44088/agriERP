import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Bell, BellOff, CheckCheck, Info, Mail, Trash2 } from "lucide-react";
import api, { errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EmailRuns from "@/pages/ScheduleHistory";

const LEVEL = {
  warning: { icon: AlertTriangle, cls: "text-secondary" },
  success: { icon: CheckCheck, cls: "text-primary" },
  info: { icon: Info, cls: "text-muted-foreground" },
};

const FEATURE_LABEL = {
  general: "Business",
  purchases: "Purchases",
  sales: "Sales",
  receipts: "Payments",
  "credit-notes": "Credit Notes",
  "debit-notes": "Debit Notes",
  invoices: "Invoices",
  stock: "Stock",
};

const Notifications = () => {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("notifications");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get("/notifications")
      .then(({ data }) => setData(data))
      .catch((e) => toast.error(errMsg(e)));
  }, []);

  useEffect(load, [load]);

  const markAll = async () => {
    setBusy(true);
    try {
      await api.post("/notifications/read-all");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    setBusy(true);
    try {
      await api.delete("/notifications");
      toast.success("Notifications cleared");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const openItem = async (n) => {
    if (n.read) return;
    await api.post(`/notifications/${n.id}/read`).catch(() => {});
    load();
  };

  const items = data?.items || [];

  return (
    <div data-testid="notifications-page">
      <PageHeader
        title="Notifications"
        subtitle="Everything that happened in this company — entries, payments, stock warnings and scheduled emails. Items clear themselves after 2 days."
        action={
          tab === "notifications" ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-10 gap-2"
                disabled={busy || !data?.unread}
                data-testid="notif-page-mark-all"
                onClick={markAll}
              >
                <CheckCheck className="h-4 w-4" /> Mark all read
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  className="h-10 gap-2 text-destructive"
                  disabled={busy || !items.length}
                  data-testid="notif-page-clear"
                  onClick={clearAll}
                >
                  <Trash2 className="h-4 w-4" /> Clear
                </Button>
              )}
            </div>
          ) : null
        }
      />

      <div className="mb-6 flex gap-1 border-b border-border">
        {[
          { key: "notifications", label: "Notifications", icon: Bell },
          ...(isAdmin ? [{ key: "email-runs", label: "Email runs", icon: Mail }] : []),
        ].map((t) => (
          <button
            key={t.key}
            data-testid={`notif-tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors duration-200 ${
              tab === t.key
                ? "border-primary font-semibold text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
            {t.key === "notifications" && data?.unread > 0 && (
              <Badge className="rounded-full bg-destructive/10 text-destructive hover:bg-destructive/10">
                {data.unread}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {tab === "notifications" ? (
        !data ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div
            className="rounded-sm border border-border bg-white p-12 text-center"
            data-testid="notif-page-empty"
          >
            <BellOff className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-4 font-head text-base font-extrabold">No notifications</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Record a purchase, sale or payment and it will show up here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-sm border border-border bg-white">
            {items.map((n) => {
              const meta = LEVEL[n.level] || LEVEL.info;
              return (
                <li
                  key={n.id}
                  data-testid={`notif-row-${n.id}`}
                  onClick={() => openItem(n)}
                  className={`flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-muted/40 ${
                    n.read ? "" : "bg-primary/[0.04]"
                  }`}
                >
                  <meta.icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.cls}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{n.title}</p>
                      <Badge className="rounded-full bg-muted text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted">
                        {FEATURE_LABEL[n.feature] || n.feature}
                      </Badge>
                      {!n.read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive" data-testid={`notif-unread-${n.id}`} />
                      )}
                    </div>
                    {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {(n.created_at || "").slice(0, 16).replace("T", " ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <EmailRuns embedded />
      )}
    </div>
  );
};

export default Notifications;
