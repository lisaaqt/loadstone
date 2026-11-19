"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Ban,
  Copy,
  Database,
  Eye,
  KeyRound,
  Plus,
  ServerOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useServer } from "@/components/servers/use-server";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/misc";

type Engine = "MYSQL" | "MARIADB" | "MONGODB";
interface DatabaseRow {
  id: string;
  name: string;
  username: string;
  remote: string;
  createdAt: string;
  engine: Engine;
  hostName: string;
  address: string;
  url: string;
}
interface DatabasesResponse {
  limit: number;
  databases: DatabaseRow[];
  hosts: { id: string; name: string; engine: Engine; address: string }[];
}

const ENGINE_LABEL: Record<Engine, string> = {
  MYSQL: "MySQL",
  MARIADB: "MariaDB",
  MONGODB: "MongoDB",
};

function copy(value: string, label: string) {
  void navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${label} copied`));
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-subtle">{label}</div>
      <button
        type="button"
        onClick={() => copy(value, label)}
        className="group flex max-w-full items-center gap-1.5 font-mono text-xs text-foreground hover:text-primary"
        title={`Copy ${label.toLowerCase()}`}
      >
        <span className="truncate">{value}</span>
        <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </div>
  );
}

function Notice({
  tone,
  icon: Icon,
  title,
  text,
}: {
  tone: "warning" | "neutral";
  icon: typeof Ban;
  title: string;
  text: string;
}) {
  return (
    <div className="px-4 pb-4">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border px-4 py-3.5",
          tone === "warning"
            ? "border-warning/30 bg-warning/[0.07]"
            : "border-border bg-surface-2/60 dark:bg-white/[0.02]",
        )}
      >
        <span
          className={cn(
            "icon-tile size-9 shrink-0 rounded-lg",
            tone === "warning" ? "text-warning" : "text-muted",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-medium">{title}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{text}</p>
        </div>
      </div>
    </div>
  );
}

export default function DatabasesPage() {
  const server = useServer();
  const key = `/api/servers/${server.id}/databases`;
  const { data, mutate } = useSWR<DatabasesResponse>(key);
  const [form, setForm] = useState({ hostId: "", name: "", remote: "%" });
  const [busy, setBusy] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<
    Record<string, { password: string; url: string }>
  >({});
  const [toDelete, setToDelete] = useState<DatabaseRow | null>(null);

  if (!data) return <Skeleton className="h-64" />;
  const hostId = form.hostId || data.hosts[0]?.id || "";
  const engine = data.hosts.find((h) => h.id === hostId)?.engine;
  const full = data.databases.length >= data.limit;

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label);
    try {
      return await fn();
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await run("create", () =>
      api<{
        database: { id: string; name: string; password: string; url: string };
      }>(key, { body: { ...form, hostId } }),
    );
    if (!res) return;
    setRevealed((r) => ({
      ...r,
      [res.database.id]: {
        password: res.database.password,
        url: res.database.url,
      },
    }));
    toast.success(`Database ${res.database.name} created`);
    setForm({ ...form, name: "" });
    await mutate();
  }

  async function reveal(d: DatabaseRow) {
    if (revealed[d.id]) return setRevealed(({ [d.id]: _, ...rest }) => rest);
    const res = await run(`reveal-${d.id}`, () =>
      api<{ password: string; url: string }>(`${key}/${d.id}`),
    );
    if (res) setRevealed((r) => ({ ...r, [d.id]: res }));
  }

  async function rotate(d: DatabaseRow) {
    const res = await run(`rotate-${d.id}`, () =>
      api<{ password: string; url: string }>(`${key}/${d.id}`, {
        method: "POST",
      }),
    );
    if (!res) return;
    setRevealed((r) => ({ ...r, [d.id]: res }));
    toast.success("New password set", {
      description: "Update it in your plugin configs.",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Databases"
          description="MySQL, MariaDB or MongoDB databases for plugins such as LuckPerms or CoreProtect. Each database has its own user."
          icon={<Database />}
          actions={
            <Badge tone={full ? "warning" : "neutral"}>
              {data.databases.length} / {data.limit}
            </Badge>
          }
        />
        {data.databases.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Database}
              title="No databases yet"
              description="Create one below; the connection details appear here."
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.databases.map((d) => {
              const secret = revealed[d.id];
              return (
                <div key={d.id} className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-medium">
                      {d.name}
                    </span>
                    <Badge tone="info">{ENGINE_LABEL[d.engine]}</Badge>
                    <span className="text-xs text-subtle">
                      on {d.hostName} · created {timeAgo(d.createdAt)}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `reveal-${d.id}`}
                        onClick={() => reveal(d)}
                      >
                        <Eye /> {secret ? "Hide" : "Show password"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={busy === `rotate-${d.id}`}
                        onClick={() => rotate(d)}
                      >
                        <KeyRound /> New password
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Delete ${d.name}`}
                        onClick={() => setToDelete(d)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Detail label="Address" value={d.address} />
                    <Detail label="Database" value={d.name} />
                    <Detail label="Username" value={d.username} />
                    {secret ? (
                      <Detail label="Password" value={secret.password} />
                    ) : (
                      <Detail label="Allowed from" value={d.remote} />
                    )}
                  </div>
                  <Detail
                    label="Connection string"
                    value={secret?.url ?? d.url}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="New database"
          description={
            data.hosts.length && !full
              ? "The name gets a server prefix, e.g. luckperms → s1a2b3c4_luckperms."
              : undefined
          }
          icon={<Plus />}
        />
        {full ? (
          <Notice
            tone="warning"
            icon={Ban}
            title={`Maximum reached (${data.databases.length} / ${data.limit})`}
            text={
              data.limit === 0
                ? "Databases aren't enabled for this server. An administrator can raise the limit in the server's Settings → Resources."
                : "Delete a database to create a new one, or ask an administrator to raise the limit in the server's Settings → Resources."
            }
          />
        ) : data.hosts.length === 0 ? (
          <Notice
            tone="neutral"
            icon={ServerOff}
            title="No database host available"
            text="An administrator can add a MySQL, MariaDB or MongoDB server under Settings → Database hosts."
          />
        ) : (
          <form
            onSubmit={create}
            className="grid grid-cols-1 items-end gap-4 p-4 md:grid-cols-[1.2fr_1fr_1fr_auto]"
          >
            <Field label="Host" htmlFor="db-host">
              <Select
                id="db-host"
                value={hostId}
                onValueChange={(v) => setForm({ ...form, hostId: v })}
                options={data.hosts.map((h) => ({
                  value: h.id,
                  label: h.name,
                  description: `${ENGINE_LABEL[h.engine]} · ${h.address}`,
                }))}
              />
            </Field>
            <Field label="Name" htmlFor="db-name">
              <Input
                id="db-name"
                required
                placeholder="luckperms"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value.toLowerCase() })
                }
              />
            </Field>
            <Field
              label="Allowed connections"
              htmlFor="db-remote"
              hint={
                engine === "MONGODB"
                  ? "Not used by MongoDB."
                  : "% = from anywhere"
              }
            >
              <Input
                id="db-remote"
                className="font-mono text-xs"
                value={form.remote}
                disabled={engine === "MONGODB"}
                onChange={(e) => setForm({ ...form, remote: e.target.value })}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              loading={busy === "create"}
              disabled={full || !form.name}
            >
              <Plus /> Create
            </Button>
          </form>
        )}
      </Card>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name}?`}
        description="The database, all its data and its user are removed from the host. This cannot be undone."
        confirmLabel="Delete database"
        destructive
        loading={busy === "delete"}
        onConfirm={async () => {
          const d = toDelete!;
          const ok = await run("delete", () =>
            api(`${key}/${d.id}`, { method: "DELETE" }),
          );
          if (ok !== null) {
            toast.success(`Deleted ${d.name}`);
            setToDelete(null);
            await mutate();
          }
        }}
      />
    </div>
  );
}
