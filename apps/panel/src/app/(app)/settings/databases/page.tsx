"use client";

import { useState } from "react";
import useSWR from "swr";
import { Database, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/misc";

type Engine = "MYSQL" | "MARIADB" | "MONGODB";
interface Host {
  id: string;
  name: string;
  engine: Engine;
  host: string;
  port: number;
  username: string;
  connectHost: string | null;
  maxDatabases: number | null;
  databaseCount: number;
}
interface HostForm {
  name: string;
  engine: Engine;
  host: string;
  port: number;
  username: string;
  password: string;
  connectHost: string;
  maxDatabases: string;
}

const ENGINES: { value: Engine; label: string; port: number; user: string }[] = [
  { value: "MARIADB", label: "MariaDB", port: 3306, user: "root" },
  { value: "MYSQL", label: "MySQL", port: 3306, user: "root" },
  { value: "MONGODB", label: "MongoDB", port: 27017, user: "admin" },
];
const MASK = "••••••••";
const EMPTY: HostForm = { name: "", engine: "MARIADB", host: "", port: 3306, username: "root", password: "", connectHost: "", maxDatabases: "" };

export default function DatabaseHostsPage() {
  const { data, mutate } = useSWR<{ hosts: Host[] }>("/api/database-hosts");
  const [editing, setEditing] = useState<{ id: string | null; form: HostForm } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Host | null>(null);

  if (!data) return <Skeleton className="h-64" />;
  const form = editing?.form;
  const set = <K extends keyof HostForm>(k: K, v: HostForm[K]) => editing && setEditing({ ...editing, form: { ...editing.form, [k]: v } });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const f = editing.form;
    const body = { ...f, connectHost: f.connectHost || null, maxDatabases: f.maxDatabases === "" ? null : Number(f.maxDatabases) };
    try {
      const res = await api<{ version: string }>(editing.id ? `/api/database-hosts/${editing.id}` : "/api/database-hosts", {
        method: editing.id ? "PATCH" : "POST",
        body,
      });
      toast.success(editing.id ? "Database host updated" : "Database host added", { description: `Connected: ${res.version}` });
      setEditing(null);
      await mutate();
    } catch (err) {
      toast.error("Could not save the host", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Database hosts"
          description="Existing MySQL, MariaDB or MongoDB servers. Users create databases on them from their server's Databases tab, each with its own user."
          icon={<Database />}
          actions={
            <Button variant="primary" size="sm" onClick={() => setEditing({ id: null, form: EMPTY })}>
              <Plus /> Add host
            </Button>
          }
        />
        {data.hosts.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Database} title="No database hosts" description="Add a database server with an admin account that may create databases and users." />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.hosts.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    {h.name} <Badge tone="info">{ENGINES.find((e) => e.value === h.engine)?.label}</Badge>
                  </div>
                  <div className="truncate font-mono text-xs text-muted">
                    {h.username}@{h.host}:{h.port}
                    {h.connectHost && ` · servers connect to ${h.connectHost}`}
                  </div>
                </div>
                <span className="text-xs text-muted tabular">
                  {h.databaseCount}
                  {h.maxDatabases !== null && ` / ${h.maxDatabases}`} databases
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Edit ${h.name}`}
                  onClick={() =>
                    setEditing({
                      id: h.id,
                      form: { ...h, password: MASK, connectHost: h.connectHost ?? "", maxDatabases: h.maxDatabases === null ? "" : String(h.maxDatabases) },
                    })
                  }
                >
                  <Pencil />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Remove ${h.name}`} onClick={() => setToDelete(h)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? "Edit database host" : "Add database host"} description="Loadstone tests the login before saving." size="lg">
          {form && (
            <form onSubmit={save}>
              <DialogBody>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Name" htmlFor="h-name">
                    <Input id="h-name" required placeholder="Main MariaDB" value={form.name} onChange={(e) => set("name", e.target.value)} />
                  </Field>
                  <Field label="Engine" htmlFor="h-engine">
                    <Select
                      id="h-engine"
                      value={form.engine}
                      onValueChange={(v) => {
                        const def = ENGINES.find((e) => e.value === v)!;
                        setEditing({ ...editing!, form: { ...form, engine: def.value, port: def.port, username: form.username || def.user } });
                      }}
                      options={ENGINES.map((e) => ({ value: e.value, label: e.label }))}
                    />
                  </Field>
                  <Field label="Host" htmlFor="h-host" hint="Address the panel uses to reach the database server.">
                    <Input id="h-host" required placeholder="db.example.com" value={form.host} onChange={(e) => set("host", e.target.value)} />
                  </Field>
                  <Field label="Port" htmlFor="h-port">
                    <Input id="h-port" type="number" required value={form.port} onChange={(e) => set("port", Number(e.target.value))} />
                  </Field>
                  <Field label="Admin user" htmlFor="h-user" hint="Needs rights to create databases and users.">
                    <Input id="h-user" required value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" />
                  </Field>
                  <Field label="Admin password" htmlFor="h-pass" hint="Encrypted at rest with APP_SECRET.">
                    <Input id="h-pass" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
                  </Field>
                  <Field label="Address for servers" htmlFor="h-connect" hint="Optional: what Minecraft servers connect to, if different.">
                    <Input id="h-connect" placeholder={form.host || "10.0.0.5"} value={form.connectHost} onChange={(e) => set("connectHost", e.target.value)} />
                  </Field>
                  <Field label="Max databases" htmlFor="h-max" hint="Empty = unlimited.">
                    <Input id="h-max" type="number" min={0} value={form.maxDatabases} onChange={(e) => set("maxDatabases", e.target.value)} />
                  </Field>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={saving}>
                  Test and save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Remove ${toDelete?.name}?`}
        description="Only hosts without databases can be removed. Databases on the server itself are not touched."
        confirmLabel="Remove host"
        destructive
        onConfirm={async () => {
          try {
            await api(`/api/database-hosts/${toDelete!.id}`, { method: "DELETE" });
            toast.success("Database host removed");
            setToDelete(null);
            await mutate();
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}
