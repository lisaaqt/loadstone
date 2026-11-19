"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { FileCode, Save } from "lucide-react";
import { toast } from "sonner";
import { isProxySoftware, JAVA_VERSIONS, SOFTWARE } from "@loadstone/shared";
import { api, errorMessage } from "@/lib/client";
import { useServer } from "@/components/servers/use-server";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton, Switch } from "@/components/ui/misc";
import { EnvEditor, envToRows, rowsToEnv, type EnvRow } from "@/components/servers/env-editor";
import { VersionPicker } from "@/components/servers/version-picker";
import { JvmFlagsField } from "@/components/servers/jvm-flags-field";

interface ServerDetail {
  server: { mcVersion: string; javaVersion: string; jvmArgs: string; env: Record<string, string>; software: string; memoryMb: number };
}

type PropDef = { key: string; label: string; type: "text" | "number" | "bool" | "select"; options?: string[]; hint?: string };

const PROPS: PropDef[] = [
  { key: "motd", label: "MOTD", type: "text", hint: "Message shown in the server list." },
  { key: "max-players", label: "Max players", type: "number" },
  { key: "difficulty", label: "Difficulty", type: "select", options: ["peaceful", "easy", "normal", "hard"] },
  { key: "gamemode", label: "Default game mode", type: "select", options: ["survival", "creative", "adventure", "spectator"] },
  { key: "view-distance", label: "View distance", type: "number" },
  { key: "simulation-distance", label: "Simulation distance", type: "number" },
  { key: "spawn-protection", label: "Spawn protection radius", type: "number" },
  { key: "level-seed", label: "World seed", type: "text", hint: "Only used when generating a new world." },
  { key: "pvp", label: "PvP", type: "bool" },
  { key: "online-mode", label: "Online mode", type: "bool", hint: "Authenticate players with Mojang." },
  { key: "allow-flight", label: "Allow flight", type: "bool" },
  { key: "hardcore", label: "Hardcore", type: "bool" },
  { key: "allow-nether", label: "Allow Nether", type: "bool" },
  { key: "enable-command-block", label: "Command blocks", type: "bool" },
];

export default function ConfigurationPage() {
  const server = useServer();
  const def = SOFTWARE[server.software];
  return (
    <div className="flex flex-col gap-3">
      <StartupCard id={server.id} usesVersion={def.usesMinecraftVersion} isCustom={server.software === "CUSTOM"} />
      {!isProxySoftware(server.software) && server.software !== "CUSTOM" && <PropertiesCard id={server.id} running={server.state === "RUNNING"} />}
    </div>
  );
}

function StartupCard({ id, usesVersion, isCustom }: { id: string; usesVersion: boolean; isCustom: boolean }) {
  const { data, mutate } = useSWR<ServerDetail>(`/api/servers/${id}`);
  const [form, setForm] = useState<{ mcVersion: string; javaVersion: string; jvmArgs: string } | null>(null);
  const [env, setEnv] = useState<EnvRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !form) {
      setForm({ mcVersion: data.server.mcVersion, javaVersion: data.server.javaVersion, jvmArgs: data.server.jvmArgs });
      setEnv(envToRows(data.server.env ?? {}));
    }
  }, [data, form]);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const res = await api<{ needsRestart: boolean }>(`/api/servers/${id}`, {
        method: "PATCH",
        body: { ...(usesVersion ? { mcVersion: form.mcVersion } : {}), ...(isCustom ? {} : { javaVersion: form.javaVersion, jvmArgs: form.jvmArgs }), env: rowsToEnv(env) },
      });
      toast.success("Startup configuration saved", { description: res.needsRestart ? "Restart the server to apply the changes." : "Changes apply on next start." });
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Startup" description="Runtime configuration applied when the container is (re)created on start." />
      {!form ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          {!isCustom && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {usesVersion && (
                <Field label="Minecraft version" hint="Changing versions downloads a new server jar. Back up first.">
                  <VersionPicker value={form.mcVersion} onChange={(v) => setForm({ ...form, mcVersion: v })} />
                </Field>
              )}
              <Field label="Java version">
                <Select value={form.javaVersion} onValueChange={(v) => setForm({ ...form, javaVersion: v })} options={JAVA_VERSIONS.map((v) => ({ value: v, label: `Java ${v}` }))} />
              </Field>
            </div>
          )}
          {!isCustom && data && (
            <Field label="JVM flags">
              <JvmFlagsField
                value={form.jvmArgs}
                onChange={(v) => setForm({ ...form, jvmArgs: v })}
                memoryMb={data.server.memoryMb}
                javaVersion={form.javaVersion}
                proxy={isProxySoftware(data.server.software)}
              />
            </Field>
          )}
          <Field label="Environment variables" hint="Reserved variables (EULA, TYPE, MEMORY, INIT_MEMORY, MAX_MEMORY, RCON) are managed by Loadstone.">
            <EnvEditor rows={env} onChange={setEnv} />
          </Field>
        </div>
      )}
      <CardFooter>
        <Button variant="primary" onClick={save} loading={saving} disabled={!form}>
          <Save /> Save startup
        </Button>
      </CardFooter>
    </Card>
  );
}

function PropertiesCard({ id, running }: { id: string; running: boolean }) {
  const { data, isLoading, mutate } = useSWR<{ exists: boolean; properties: Record<string, string> }>(`/api/servers/${id}/properties`);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setValues(data.properties);
  }, [data]);

  const changed = useMemo(() => Object.fromEntries(Object.entries(values).filter(([k, v]) => data?.properties[k] !== v)), [values, data]);
  const others = Object.keys(values)
    .filter((k) => !PROPS.some((p) => p.key === k))
    .sort();

  async function save() {
    setSaving(true);
    try {
      await api(`/api/servers/${id}/properties`, { method: "PUT", body: { properties: changed } });
      toast.success("server.properties saved", { description: running ? "Restart the server to apply." : undefined });
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const setVal = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <Card>
      <CardHeader
        title="Server properties"
        description={data && !data.exists ? "server.properties is generated on first start. Values you set now will be merged in." : "Common settings from server.properties."}
        actions={
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/servers/${id}/files?edit=${encodeURIComponent("/server.properties")}`}>
              <FileCode /> Edit raw
            </Link>
          </Button>
        }
      />
      {isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : (
        <div className="flex flex-col gap-6 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {PROPS.filter((p) => p.type !== "bool").map((p) => (
              <Field key={p.key} label={p.label} hint={p.hint}>
                {p.type === "select" ? (
                  <Select value={values[p.key] ?? ""} onValueChange={(v) => setVal(p.key, v)} placeholder="Default" options={p.options!.map((o) => ({ value: o, label: o[0]!.toUpperCase() + o.slice(1) }))} />
                ) : (
                  <Input type={p.type === "number" ? "number" : "text"} value={values[p.key] ?? ""} onChange={(e) => setVal(p.key, e.target.value)} placeholder="Default" />
                )}
              </Field>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2 lg:grid-cols-3">
            {PROPS.filter((p) => p.type === "bool").map((p) => (
              <label key={p.key} className="flex items-center justify-between gap-3 rounded-md px-1 py-2">
                <span>
                  <span className="block text-[13px]">{p.label}</span>
                  {p.hint && <span className="block text-xs text-muted">{p.hint}</span>}
                </span>
                <Switch checked={values[p.key] === "true"} onCheckedChange={(v) => setVal(p.key, String(v))} />
              </label>
            ))}
          </div>
          {others.length > 0 && (
            <details className="group rounded-lg border border-border">
              <summary className="cursor-pointer select-none px-3 py-2 text-[13px] text-muted hover:text-foreground">All other properties ({others.length})</summary>
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-border p-3 md:grid-cols-2">
                {others.map((k) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-48 shrink-0 truncate font-mono text-xs text-muted" title={k}>
                      {k}
                    </span>
                    <Input value={values[k] ?? ""} onChange={(e) => setVal(k, e.target.value)} className="h-7 font-mono text-xs" />
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
      <CardFooter>
        <span className="mr-auto text-xs text-muted">{Object.keys(changed).length ? `${Object.keys(changed).length} unsaved change(s)` : "No changes"}</span>
        <Button variant="primary" onClick={save} loading={saving} disabled={!Object.keys(changed).length}>
          <Save /> Save properties
        </Button>
      </CardFooter>
    </Card>
  );
}
