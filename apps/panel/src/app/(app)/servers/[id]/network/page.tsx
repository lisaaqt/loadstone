"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { ArrowDown, ArrowUp, Globe, Network, Plus, RotateCw, Save, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ServerSoftware, ServerState } from "@/generated/prisma/client";
import { api, errorMessage } from "@/lib/client";
import { useServer } from "@/components/servers/use-server";
import { SoftwareIcon } from "@/components/servers/software-icon";
import { stateMeta } from "@/components/servers/state";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton, Switch } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/layout";

type Mode = "modern" | "legacy" | "none";
interface Candidate {
  id: string;
  name: string;
  software: ServerSoftware;
  state: ServerState;
  nodeName: string;
  address: string;
  forwarding: { modern: boolean; legacy: boolean };
}
interface Entry {
  name: string;
  address: string;
  serverId: string | null;
  fallback: boolean;
  forcedHosts: string[];
}
interface NetworkResponse {
  ready: boolean;
  configFile?: string;
  supportsModern?: boolean;
  forwardingMode?: Mode;
  entries?: Entry[];
  candidates: Candidate[];
}

const slug = (name: string, taken: string[]) => {
  const base = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "server";
  let n = base;
  for (let i = 2; taken.includes(n); i++) n = `${base}-${i}`;
  return n;
};

export default function NetworkPage() {
  const server = useServer();
  const key = `/api/servers/${server.id}/network`;
  const { data, mutate, error } = useSWR<NetworkResponse>(key, { refreshInterval: 15_000, revalidateOnFocus: true });
  const [mode, setMode] = useState<Mode>("modern");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [external, setExternal] = useState({ name: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ restart: { id: string; name: string }[]; warnings: string[] } | null>(null);

  useEffect(() => {
    if (data?.ready && entries === null) {
      setEntries(data.entries ?? []);
      const fallbackMode: Mode = data.supportsModern === false ? "legacy" : "modern";
      setMode(data.forwardingMode === "none" || !data.forwardingMode ? fallbackMode : data.forwardingMode);
    }
  }, [data, entries]);

  if (error) return <EmptyState icon={Network} title="Could not load the proxy configuration" description={errorMessage(error)} />;
  if (!data) return <Skeleton className="h-72" />;
  if (!data.ready) {
    return (
      <EmptyState
        icon={Network}
        title="Start the proxy once"
        description={`The proxy creates ${data.configFile ?? "its config file"} on its first start. Start it, wait until it's running, then come back to add servers.`}
      />
    );
  }
  if (!entries) return <Skeleton className="h-72" />;

  const byId = new Map(data.candidates.map((c) => [c.id, c]));
  const available = data.candidates.filter((c) => !entries.some((e) => e.serverId === c.id));
  const update = (i: number, patch: Partial<Entry>) => setEntries(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...entries];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setEntries(next);
  };
  const add = (c: Candidate) =>
    setEntries([...entries, { name: slug(c.name, entries.map((e) => e.name)), address: c.address, serverId: c.id, fallback: !entries.some((e) => e.fallback), forcedHosts: [] }]);

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ reloaded: boolean; restart: { id: string; name: string }[]; warnings: string[] }>(key, {
        method: "PUT",
        body: { forwardingMode: mode, entries: entries!.map((e) => ({ ...e, address: e.serverId ? undefined : e.address })) },
      });
      setResult(res);
      toast.success("Network saved", {
        description: res.reloaded ? "The proxy reloaded its configuration." : "Restart the proxy to apply the new configuration.",
      });
      const fresh = await mutate();
      setEntries(fresh?.entries ?? []);
      if (fresh?.forwardingMode) setMode(fresh.forwardingMode === "none" ? "modern" : fresh.forwardingMode);
    } catch (err) {
      toast.error("Could not save the network", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function restart(id: string, name: string) {
    try {
      await api(`/api/servers/${id}/power`, { body: { action: "restart" } });
      toast.success(`Restarting ${name}`);
      setResult((r) => (r ? { ...r, restart: r.restart.filter((s) => s.id !== id) } : r));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {result && (result.restart.length > 0 || result.warnings.length > 0) && (
        <Card className="border-warning/30">
          <div className="flex flex-col gap-3 p-4 text-[13px]">
            {result.restart.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted">Restart these servers so they accept players from the proxy:</span>
                {result.restart.map((s) => (
                  <Button key={s.id} size="sm" onClick={() => restart(s.id, s.name)}>
                    <RotateCw /> {s.name}
                  </Button>
                ))}
              </div>
            )}
            {result.warnings.map((w) => (
              <p key={w} className="text-xs text-warning">
                {w}
              </p>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Servers in this proxy"
          description="Players join the first fallback server; if it's down they're sent to the next one. Forced hosts send a domain straight to one server."
          icon={<Network />}
        />
        <div className="divide-y divide-border">
          {entries.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-muted">No servers yet. Add one below with a click.</p>}
          {entries.map((e, i) => {
            const c = e.serverId ? byId.get(e.serverId) : undefined;
            const meta = c ? stateMeta(c.state) : null;
            return (
              <div key={`${e.serverId ?? e.address}-${i}`} className="grid grid-cols-1 items-center gap-3 px-5 py-3.5 lg:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div className="flex items-center gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === entries.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  {c ? <SoftwareIcon software={c.software} className="size-5 shrink-0" /> : <Globe className="size-5 shrink-0 text-subtle" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate text-[13px] font-medium">
                      {c?.name ?? "External server"}
                      {meta && <StatusDot tone={meta.tone} pulse={meta.pulse} className="size-1.5" />}
                      {e.fallback && <Badge tone="primary">Fallback #{entries.filter((x) => x.fallback).indexOf(e) + 1}</Badge>}
                    </div>
                    <div className="truncate font-mono text-[11px] text-subtle">{e.address}</div>
                  </div>
                </div>
                <Field label="Name in proxy" htmlFor={`name-${i}`}>
                  <Input id={`name-${i}`} className="font-mono text-xs" value={e.name} onChange={(ev) => update(i, { name: ev.target.value.toLowerCase() })} />
                </Field>
                <Field label="Forced hosts" htmlFor={`hosts-${i}`}>
                  <Input
                    id={`hosts-${i}`}
                    className="text-xs"
                    placeholder="survival.example.com"
                    value={e.forcedHosts.join(", ")}
                    onChange={(ev) => update(i, { forcedHosts: ev.target.value.split(/[\s,]+/).filter(Boolean) })}
                  />
                </Field>
                <div className="flex items-center gap-3 lg:justify-end">
                  <label className="flex items-center gap-2 text-xs text-muted">
                    Fallback
                    <Switch checked={e.fallback} onCheckedChange={(v) => update(i, { fallback: v })} aria-label={`Use ${e.name} as fallback`} />
                  </label>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${e.name}`} onClick={() => setEntries(entries.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <CardFooter>
          <Button variant="primary" onClick={save} loading={saving}>
            <Save /> Save network
          </Button>
        </CardFooter>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Add your servers" description="One click adds the server and sets up player forwarding for it." icon={<Plus />} />
          <div className="divide-y divide-border">
            {available.length === 0 && <p className="px-5 py-6 text-center text-[13px] text-muted">All your servers are already in this proxy.</p>}
            {available.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                <SoftwareIcon software={c.software} className="size-5" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{c.name}</div>
                  <div className="truncate text-xs text-muted">
                    {c.software} · {c.nodeName}
                    {mode !== "none" && !c.forwarding[mode] && " · needs a proxy mod"}
                  </div>
                </div>
                <Button size="sm" onClick={() => add(c)}>
                  <Plus /> Add
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-border p-4">
            <div className="text-xs font-medium text-muted">External server (not managed by Loadstone)</div>
            <div className="flex gap-2">
              <Input placeholder="name" className="w-32 font-mono text-xs" value={external.name} onChange={(e) => setExternal({ ...external, name: e.target.value.toLowerCase() })} />
              <Input placeholder="host:25565" className="font-mono text-xs" value={external.address} onChange={(e) => setExternal({ ...external, address: e.target.value })} />
              <Button
                disabled={!external.name || !external.address}
                onClick={() => {
                  setEntries([...entries, { name: external.name, address: external.address, serverId: null, fallback: false, forcedHosts: [] }]);
                  setExternal({ name: "", address: "" });
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Player forwarding" description="How the proxy passes real player names, UUIDs and IPs to your servers." icon={<Shield />} />
          <div className="flex flex-col gap-3 p-4">
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
              options={[
                ...(data.supportsModern === false
                  ? []
                  : [{ value: "modern", label: "Modern (recommended)", description: "Secure Velocity forwarding. Paper, Purpur and Folia are configured automatically." }]),
                {
                  value: "legacy",
                  label: data.supportsModern === false ? "BungeeCord (recommended)" : "Legacy (BungeeCord)",
                  description: "Sets ip_forward on the proxy and bungeecord: true in each server's spigot.yml.",
                },
                { value: "none", label: "None", description: "Servers see the proxy's IP and offline UUIDs. Not recommended." },
              ]}
            />
            <p className="text-xs leading-relaxed text-muted">
              Saving writes {data.configFile ?? "the proxy config"}
              {data.supportsModern === false ? "" : " and the forwarding secret"}, turns off online-mode on the added servers (the proxy authenticates players
              instead), and configures their Paper or Spigot settings. Servers on this node are reached over the private server network, so their ports
              don&apos;t need to be public.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
