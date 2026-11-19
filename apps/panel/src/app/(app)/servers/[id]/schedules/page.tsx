"use client";

import { useState } from "react";
import useSWR from "swr";
import { Archive, Brush, MoreHorizontal, Pencil, Play, Plus, Power, PowerOff, RotateCw, Terminal, Timer, Trash2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import type { ScheduleAction } from "@/generated/prisma/client";
import { api, errorMessage } from "@/lib/client";
import { formatDate, timeAgo } from "@/lib/format";
import { useServer } from "@/components/servers/use-server";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/layout";
import { Skeleton, Switch } from "@/components/ui/misc";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";

interface ScheduleRow {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  action: ScheduleAction;
  payload: string | null;
  enabled: boolean;
  onlyWhenRunning: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  description: string;
  nextRuns: string[];
}

const ACTIONS: Record<ScheduleAction, { label: string; icon: LucideIcon; description: string }> = {
  COMMAND: { label: "Run command", icon: Terminal, description: "Send a console command" },
  RESTART: { label: "Restart", icon: RotateCw, description: "Restart the server" },
  START: { label: "Start", icon: Power, description: "Start the server" },
  STOP: { label: "Stop", icon: PowerOff, description: "Stop the server" },
  BACKUP: { label: "Backup", icon: Archive, description: "Create a backup and apply retention" },
  CLEANUP: { label: "Cleanup", icon: Brush, description: "Delete old logs and crash reports" },
};

const PRESETS = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily at 04:00", cron: "0 4 * * *" },
  { label: "Weekly (Mon 04:00)", cron: "0 4 * * 1" },
];

type FormState = Omit<ScheduleRow, "id" | "lastRunAt" | "lastStatus" | "lastError" | "description" | "nextRuns"> & { id?: string };

const EMPTY: FormState = { name: "", cron: "0 4 * * *", timezone: "UTC", action: "BACKUP", payload: "", enabled: true, onlyWhenRunning: false };

export default function SchedulesPage() {
  const server = useServer();
  const base = `/api/servers/${server.id}/schedules`;
  const { data, isLoading, mutate } = useSWR<{ schedules: ScheduleRow[] }>(base);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [remove, setRemove] = useState<ScheduleRow | null>(null);

  async function save(form: FormState) {
    const { id, ...body } = form;
    try {
      await api(id ? `${base}/${id}` : base, { method: id ? "PUT" : "POST", body: { ...body, payload: body.payload || null } });
      toast.success(id ? "Schedule updated" : "Schedule created");
      setEditing(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function runNow(s: ScheduleRow) {
    try {
      await api(`${base}/${s.id}`, { method: "POST" });
      toast.success(`Triggered “${s.name}”`);
      setTimeout(() => void mutate(), 2000);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Schedules"
        description="Cron-based automation: backups, restarts, commands and cleanup."
        actions={
          <Button size="sm" variant="primary" onClick={() => setEditing({ ...EMPTY, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" })}>
            <Plus /> New schedule
          </Button>
        }
      />
      {isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-12" />
        </div>
      ) : !data?.schedules.length ? (
        <EmptyState icon={Timer} title="No schedules" description="Automate nightly backups, daily restarts or periodic announcements." />
      ) : (
        <ul className="divide-y divide-border">
          {data.schedules.map((s) => {
            const a = ACTIONS[s.action];
            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
                  <a.icon className="size-4 text-muted" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    <span className="truncate">{s.name}</span>
                    <Badge>{a.label}</Badge>
                    {s.lastStatus === "failed" && <Badge tone="danger">Last run failed</Badge>}
                    {s.lastStatus === "skipped" && <Badge tone="warning">Skipped</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted">
                    <span className="font-mono">{s.cron}</span> · {s.description} ({s.timezone})
                    {s.payload && s.action === "COMMAND" && <span className="font-mono"> · /{s.payload}</span>}
                  </div>
                  <div className="truncate text-[11px] text-subtle">
                    {s.enabled && s.nextRuns[0] ? `Next ${formatDate(s.nextRuns[0])}` : "Paused"} · last run {timeAgo(s.lastRunAt)}
                    {s.lastError && <span className="text-danger"> · {s.lastError}</span>}
                  </div>
                </div>
                <Switch
                  checked={s.enabled}
                  onCheckedChange={(enabled) => void save({ ...s, enabled })}
                  aria-label="Enable schedule"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label="Schedule actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => void runNow(s)}>
                      <Play /> Run now
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setEditing({ ...s })}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setRemove(s)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <ScheduleDialog initial={editing} onClose={() => setEditing(null)} onSave={save} />}
      <ConfirmDialog
        open={remove !== null}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Delete “${remove?.name}”?`}
        description="The schedule will stop running immediately."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!remove) return;
          try {
            await api(`${base}/${remove.id}`, { method: "DELETE" });
            toast.success("Schedule deleted");
            setRemove(null);
            await mutate();
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </Card>
  );
}

function ScheduleDialog({ initial, onClose, onSave }: { initial: FormState; onClose: () => void; onSave: (f: FormState) => Promise<void> }) {
  const [form, setForm] = useState<FormState>(initial);
  const [loading, setLoading] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={form.id ? "Edit schedule" : "New schedule"} size="lg">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            await onSave(form);
            setLoading(false);
          }}
        >
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="sched-name">
                <Input id="sched-name" autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nightly backup" required maxLength={64} />
              </Field>
              <Field label="Action">
                <Select
                  value={form.action}
                  onValueChange={(v) => set("action", v as ScheduleAction)}
                  options={(Object.keys(ACTIONS) as ScheduleAction[]).map((k) => ({ value: k, label: ACTIONS[k].label, description: ACTIONS[k].description }))}
                />
              </Field>
            </div>
            {form.action === "COMMAND" && (
              <Field label="Command" htmlFor="sched-payload" hint="Without the leading slash, e.g. say Restarting in 5 minutes">
                <Input id="sched-payload" className="font-mono text-xs" value={form.payload ?? ""} onChange={(e) => set("payload", e.target.value)} required />
              </Field>
            )}
            {form.action === "CLEANUP" && (
              <Field label="Keep logs for (days)" htmlFor="sched-days">
                <Input id="sched-days" type="number" min={1} value={form.payload || "7"} onChange={(e) => set("payload", e.target.value)} />
              </Field>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Cron expression" htmlFor="sched-cron" hint="minute hour day month weekday">
                <Input id="sched-cron" className="font-mono text-xs" value={form.cron} onChange={(e) => set("cron", e.target.value)} required />
              </Field>
              <Field label="Timezone" htmlFor="sched-tz">
                <Input id="sched-tz" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.cron}
                  type="button"
                  onClick={() => set("cron", p.cron)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <span>
                <span className="block text-[13px]">Only when running</span>
                <span className="block text-xs text-muted">Skip this task if the server is offline.</span>
              </span>
              <Switch checked={form.onlyWhenRunning} onCheckedChange={(v) => set("onlyWhenRunning", v)} />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              {form.id ? "Save changes" : "Create schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
