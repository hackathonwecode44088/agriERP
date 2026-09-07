import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight } from "lucide-react";
import api, { errMsg } from "@/lib/api";
import { PageHeader } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { roleLabel } from "@/lib/constants";

const RoleBadges = ({ roles }) => (
  <>
    {(roles || []).map((r) => (
      <Badge key={r} className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
        {roleLabel(r)}
      </Badge>
    ))}
  </>
);

const DuplicateGroup = ({ group, idx, onMerge }) => {
  const [keep, setKeep] = useState(group.parties[0].id);
  return (
    <div className="border border-border bg-white p-4" data-testid={`dup-group-${idx}`}>
      <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">
        Possible duplicate · {group.parties.length} parties matched
      </p>
      <div className="space-y-2">
        {group.parties.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 border border-border/60 px-3 py-2"
          >
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="radio"
                name={`keep-${idx}`}
                checked={keep === p.id}
                onChange={() => setKeep(p.id)}
                data-testid={`dup-${idx}-keep-${p.id}`}
              />
              <span className="font-medium">{p.name}</span>
              {p.phone && <span className="text-xs text-muted-foreground">{p.phone}</span>}
              {p.village && <span className="text-xs text-muted-foreground">· {p.village}</span>}
              <RoleBadges roles={p.roles} />
            </label>
            {keep === p.id ? (
              <Badge className="rounded-full bg-accent/25 text-accent-foreground hover:bg-accent/25">
                Keep this
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                data-testid={`dup-${idx}-merge-${p.id}`}
                onClick={() => onMerge(p.id, keep)}
              >
                Merge into kept
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const PartyMerge = () => {
  const [groups, setGroups] = useState([]);
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([api.get("/parties/duplicates"), api.get("/parties")]);
      setGroups(d.data || []);
      setParties(p.data || []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const partyName = (id) => parties.find((x) => x.id === id)?.name || "—";

  const doMerge = async () => {
    if (!confirm) return;
    try {
      await api.post("/parties/merge", { source_id: confirm.source, target_id: confirm.target });
      toast.success("Parties merged. All history moved to the kept party.");
      setConfirm(null);
      setSourceId("");
      setTargetId("");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div data-testid="party-merge-page">
      <PageHeader
        title="Merge Parties"
        subtitle="Combine duplicate party records into one. All purchases, sales, ledger and payments move to the party you keep — nothing is lost."
      />

      <div className="mb-8 border border-border bg-white p-5" data-testid="manual-merge-card">
        <h2 className="font-head text-sm font-extrabold uppercase tracking-widest text-muted-foreground">
          Manual merge
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Pick any two parties. The first record is removed and everything moves into the one you keep.
        </p>
        <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr_auto]">
          <div>
            <Label className="text-xs">Merge this party (removed)</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger className="mt-1 bg-white" data-testid="manual-source">
                <SelectValue placeholder="Select party" />
              </SelectTrigger>
              <SelectContent className="max-h-72 bg-white">
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.village ? ` (${p.village})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ArrowRight className="mb-2.5 hidden h-5 w-5 text-muted-foreground sm:block" />
          <div>
            <Label className="text-xs">Into this party (kept)</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="mt-1 bg-white" data-testid="manual-target">
                <SelectValue placeholder="Select party" />
              </SelectTrigger>
              <SelectContent className="max-h-72 bg-white">
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.village ? ` (${p.village})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            data-testid="manual-merge-btn"
            disabled={!sourceId || !targetId || sourceId === targetId}
            onClick={() => setConfirm({ source: sourceId, target: targetId })}
          >
            Merge
          </Button>
        </div>
      </div>

      <h2 className="mb-3 font-head text-sm font-extrabold uppercase tracking-widest text-muted-foreground">
        Detected duplicates
      </h2>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div
          className="border border-border bg-white p-10 text-center text-sm text-muted-foreground"
          data-testid="no-duplicates"
        >
          No likely duplicates found. You can still merge any two parties manually above.
        </div>
      ) : (
        <div className="space-y-4" data-testid="duplicate-groups">
          {groups.map((g, i) => (
            <DuplicateGroup key={i} group={g} idx={i} onMerge={(source, target) => setConfirm({ source, target })} />
          ))}
        </div>
      )}

      <Dialog open={!!confirm} onOpenChange={() => setConfirm(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-head flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-secondary" /> Confirm merge
            </DialogTitle>
          </DialogHeader>
          {confirm && (
            <p className="text-sm text-muted-foreground">
              All transactions and ledger history of{" "}
              <span className="font-semibold text-foreground">{partyName(confirm.source)}</span> will move into{" "}
              <span className="font-semibold text-foreground">{partyName(confirm.target)}</span>. The first record is
              then permanently removed. This cannot be undone.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} data-testid="merge-cancel">
              Cancel
            </Button>
            <Button variant="destructive" onClick={doMerge} data-testid="merge-confirm">
              Merge & keep one
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PartyMerge;
