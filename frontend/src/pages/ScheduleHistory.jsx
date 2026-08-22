import { useEffect, useState } from "react";
import { CalendarClock, Mail, Send } from "lucide-react";
import api, { errMsg, money } from "@/lib/api";
import { toast } from "sonner";
import { DataTable, PageHeader, StatCard } from "@/components/Shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const JOB_LABEL = {
  "monthly-statements": "Monthly statements",
  "balance-reminders": "Balance reminders",
};

const ScheduleHistory = () => {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = () => {
    setLoading(true);
    api
      .get("/cron/runs")
      .then(({ data }) => setRuns(data))
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const totalSent = runs.reduce((s, r) => s + (r.sent || 0), 0);
  const current = runs.find((r) => r.run_id === expanded);

  return (
    <div data-testid="schedule-history-page">
      <PageHeader
        title="Schedule History"
        subtitle="Automatic statement and reminder emails. Statements go out on the 1st, balance reminders on the 23rd (9am IST)."
        action={
          <Button variant="outline" className="gap-2" data-testid="schedule-refresh-btn" onClick={load}>
            <CalendarClock className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard testid="schedule-runs" label="Runs Recorded" value={runs.length} icon={CalendarClock} />
        <StatCard testid="schedule-sent" label="Emails Sent" value={totalSent} icon={Send} />
        <StatCard
          testid="schedule-last"
          label="Last Run"
          value={runs[0]?.started_at ? runs[0].started_at.slice(0, 16).replace("T", " ") : "—"}
          icon={Mail}
        />
      </div>

      <DataTable
        testid="schedule"
        loading={loading}
        rows={runs}
        columns={[
          { key: "job", label: "Job", render: (r) => JOB_LABEL[r.job] || r.job },
          { key: "started_at", label: "Started", render: (r) => (r.started_at || "").slice(0, 19).replace("T", " ") },
          { key: "finished_at", label: "Finished", render: (r) => (r.finished_at || "-").slice(0, 19).replace("T", " ") },
          {
            key: "status",
            label: "Status",
            render: (r) => (
              <Badge
                className={`rounded-full ${
                  r.status === "done"
                    ? "bg-primary/10 text-primary hover:bg-primary/10"
                    : "bg-accent/25 text-accent-foreground hover:bg-accent/25"
                }`}
              >
                {r.status || "queued"}
              </Badge>
            ),
          },
          { key: "sent", label: "Sent", align: "right", render: (r) => r.sent ?? 0 },
          { key: "skipped", label: "Skipped", align: "right", render: (r) => r.skipped ?? 0 },
        ]}
        actions={(row) => (
          <Button
            size="sm"
            variant="outline"
            data-testid={`schedule-view-${row.run_id}`}
            onClick={() => setExpanded(expanded === row.run_id ? null : row.run_id)}
          >
            {expanded === row.run_id ? "Hide" : "Recipients"}
          </Button>
        )}
      />

      {current && (
        <div className="mt-6" data-testid="schedule-recipients">
          <h2 className="font-head mb-3 text-base font-extrabold md:text-lg">
            Recipients · {JOB_LABEL[current.job] || current.job}
          </h2>
          <DataTable
            testid="schedule-recipients"
            rows={current.recipients || []}
            columns={[
              { key: "name", label: "Farmer" },
              { key: "email", label: "Email" },
              { key: "balance", label: "Balance", align: "right", render: (r) => money(r.balance) },
            ]}
          />
        </div>
      )}
    </div>
  );
};

export default ScheduleHistory;
