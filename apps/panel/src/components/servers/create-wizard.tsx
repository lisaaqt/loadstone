"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Boxes, Check, Rocket } from "lucide-react";
import { toast } from "sonner";
import { detectPreset, isProxySoftware, JAVA_VERSIONS, JVM_PRESETS, jvmFlagsFor, presetsFor, recommendedJava, SOFTWARE, SOFTWARE_IDS, type JvmPresetId, type SoftwareId } from "@loadstone/shared";
import { api, errorMessage } from "@/lib/client";
import { coresToPercent, formatCores, formatMb, percentToCores } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, InputGroup, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/misc";
import { EmptyState, KeyValue } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { SoftwareIcon, SoftwareTile } from "./software-icon";
import { VersionPicker } from "./version-picker";
import { EnvEditor, rowsToEnv, type EnvRow } from "./env-editor";
import { JvmFlagsField } from "./jvm-flags-field";

interface NodeOption {
  id: string;
  name: string;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  publicHost: string;
  freeMemoryMb: number;
  freeDiskMb: number;
  portRange: [number, number];
}

const STEPS = ["Software", "Version", "Resources", "Advanced", "Review"] as const;
const MEMORY_PRESETS = [1024, 2048, 4096, 6144, 8192, 12288, 16384];
const CATEGORY_LABEL = { vanilla: "Vanilla", plugins: "Plugin servers", mods: "Mod loaders", proxy: "Proxy", custom: "Custom" } as const;

export function CreateServerWizard({
  nodes,
  users,
  currentUserId,
  limits = null,
}: {
  nodes: NodeOption[];
  users: { id: string; name: string; email: string }[];
  currentUserId: string;
  /** Set for self-service (non-admin) users: per-server caps from the panel settings. */
  limits?: { memoryMb: number; diskMb: number; cpuPercent: number } | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const onlineNodes = nodes.filter((n) => n.status === "ONLINE");

  const [form, setForm] = useState({
    name: "",
    description: "",
    software: "PAPER" as SoftwareId,
    mcVersion: "LATEST",
    javaVersion: "21" as (typeof JAVA_VERSIONS)[number],
    javaTouched: false,
    memoryMb: Math.min(4096, limits?.memoryMb ?? 4096),
    cpuPercent: limits?.cpuPercent ? Math.min(200, limits.cpuPercent) : 200,
    diskMb: Math.min(20480, limits?.diskMb ?? 20480),
    nodeId: "auto",
    port: "",
    jvmArgs: jvmFlagsFor("aikar", { memoryMb: 4096, javaVersion: "21" }),
    customImage: "",
    startupCommand: "",
    internalPort: "25565",
    ownerId: currentUserId,
    startOnCreate: true,
  });
  const [env, setEnv] = useState<EnvRow[]>([]);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const def = SOFTWARE[form.software];
  const javaVersion = form.javaTouched ? form.javaVersion : isProxySoftware(form.software) ? (form.software === "VELOCITY" ? "25" : "21") : recommendedJava(form.mcVersion);
  const selectedNode = nodes.find((n) => n.id === form.nodeId);

  const lastRuntime = useRef({ memoryMb: form.memoryMb, javaVersion, software: form.software });
  useEffect(() => {
    const prev = lastRuntime.current;
    lastRuntime.current = { memoryMb: form.memoryMb, javaVersion, software: form.software };
    const preset = detectPreset(form.jvmArgs, prev);
    if (!preset) return;
    const proxy = isProxySoftware(form.software);
    let next: JvmPresetId = proxy && !isProxySoftware(prev.software) ? "velocity" : !proxy && preset === "velocity" ? "aikar" : preset;
    if (!presetsFor({ javaVersion, proxy }).some((p) => p.id === next && p.available)) next = proxy ? "velocity" : "aikar";
    const flags = jvmFlagsFor(next, { memoryMb: form.memoryMb, javaVersion });
    if (flags !== form.jvmArgs) setForm((f) => ({ ...f, jvmArgs: flags }));
  }, [form.memoryMb, form.software, form.jvmArgs, javaVersion]);

  const grouped = useMemo(() => {
    const groups = new Map<string, SoftwareId[]>();
    for (const id of SOFTWARE_IDS.filter((s) => !limits || s !== "CUSTOM")) groups.set(SOFTWARE[id].category, [...(groups.get(SOFTWARE[id].category) ?? []), id]);
    return [...groups.entries()] as [keyof typeof CATEGORY_LABEL, SoftwareId[]][];
  }, []);

  const errors: Partial<Record<(typeof STEPS)[number], string>> = {};
  if (!form.name.trim()) errors.Software = "Give your server a name";
  if (form.software === "CUSTOM" && !form.customImage.trim()) errors.Advanced = "A Docker image is required for custom servers";
  if (limits && form.memoryMb > limits.memoryMb) errors.Resources = `Memory is limited to ${formatMb(limits.memoryMb)} per server`;
  if (limits && form.diskMb > limits.diskMb) errors.Resources = `Storage is limited to ${formatMb(limits.diskMb)} per server`;
  if (limits && limits.cpuPercent > 0 && (form.cpuPercent === 0 || form.cpuPercent > limits.cpuPercent)) errors.Resources = `CPU is limited to ${limits.cpuPercent / 100} cores per server`;
  if (selectedNode && selectedNode.freeMemoryMb < form.memoryMb) errors.Resources = `${selectedNode.name} only has ${formatMb(selectedNode.freeMemoryMb)} free`;
  if (selectedNode && selectedNode.freeDiskMb < form.diskMb) errors.Resources = `${selectedNode.name} only has ${formatMb(selectedNode.freeDiskMb)} of disk free`;
  const current = STEPS[step]!;

  async function submit() {
    setSubmitting(true);
    try {
      const { server } = await api<{ server: { id: string } }>("/api/servers", {
        body: {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          software: form.software,
          mcVersion: def.usesMinecraftVersion ? form.mcVersion : "LATEST",
          javaVersion,
          memoryMb: form.memoryMb,
          cpuPercent: form.cpuPercent,
          diskMb: form.diskMb,
          nodeId: form.nodeId === "auto" ? undefined : form.nodeId,
          port: form.port ? Number(form.port) : undefined,
          env: rowsToEnv(env),
          jvmArgs: form.jvmArgs,
          customImage: form.software === "CUSTOM" ? form.customImage.trim() : undefined,
          startupCommand: form.software === "CUSTOM" ? form.startupCommand : undefined,
          internalPort: form.software === "CUSTOM" ? Number(form.internalPort) || 25565 : undefined,
          ownerId: form.ownerId,
          startOnCreate: form.startOnCreate,
        },
      });
      toast.success("Server created", { description: "Installation has started in the background." });
      router.push(`/servers/${server.id}`);
      router.refresh();
    } catch (err) {
      toast.error("Could not create server", { description: errorMessage(err) });
      setSubmitting(false);
    }
  }

  if (onlineNodes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Boxes}
          title="No online nodes"
          description="Servers run on nodes. Register a node and start the Loadstone agent on it before creating a server."
          action={
            <Button variant="primary" asChild>
              <Link href="/nodes">Go to nodes</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[180px_1fr]">
      <div>
        <Link href="/servers" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Servers
        </Link>
        <h1 className="text-[22px] font-semibold tracking-[-0.03em]">New server</h1>
        <ol className="mt-6 flex flex-row gap-1 md:flex-col">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                disabled={i > step && Object.keys(errors).some((k) => STEPS.indexOf(k as (typeof STEPS)[number]) < i)}
                onClick={() => setStep(i)}
                className={cn(
                  "flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors disabled:opacity-40",
                  i === step
                    ? "bg-surface font-medium text-foreground shadow-soft ring-1 ring-border dark:bg-white/[0.06] dark:shadow-none dark:ring-white/[0.04]"
                    : "text-muted hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold tabular transition-colors",
                    i < step
                      ? "border-primary bg-primary text-white"
                      : i === step
                        ? "border-primary bg-primary-soft text-primary dark:text-primary-strong"
                        : "border-border-strong text-subtle",
                  )}
                >
                  {i < step ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="hidden md:inline">{s}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="min-w-0">
        <Card key={step} className="animate-slide-up">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">{STEP_TITLES[current]}</h2>
            <p className="mt-0.5 text-[13px] text-muted">{STEP_DESCRIPTIONS[current]}</p>
          </div>

          <div className="flex flex-col gap-5 p-5">
            {current === "Software" && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Server name" htmlFor="name">
                    <Input id="name" autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Survival SMP" maxLength={48} />
                  </Field>
                  {!limits && (
                  <Field label="Owner" htmlFor="owner">
                    <Select id="owner" value={form.ownerId} onValueChange={(v) => set("ownerId", v)} options={users.map((u) => ({ value: u.id, label: u.name, description: u.email }))} />
                  </Field>
                  )}
                </div>
                <Field label="Description" htmlFor="description" hint="Optional.">
                  <Textarea id="description" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={280} />
                </Field>
                {grouped.map(([category, ids]) => (
                  <div key={category}>
                    <div className="mb-2 text-xs font-medium text-muted">{CATEGORY_LABEL[category]}</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {ids.map((id) => {
                        const s = SOFTWARE[id];
                        const active = form.software === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, software: id, internalPort: String(s.internalPort) }))}
                            className={cn(
                              "flex items-start gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-150",
                              active
                                ? "border-primary/60 bg-primary-soft ring-[3px] ring-primary/10"
                                : "border-border bg-surface hover:border-border-strong hover:shadow-soft dark:bg-white/[0.015] dark:hover:bg-white/[0.03]",
                            )}
                          >
                            <SoftwareTile software={id} size="sm" className="mt-0.5" />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                                {s.label}
                                {active && <Check className="size-3.5 text-primary" />}
                              </span>
                              <span className="mt-0.5 block text-xs leading-snug text-muted">{s.description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}

            {current === "Version" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {def.usesMinecraftVersion ? (
                  <Field label="Minecraft version" htmlFor="mcVersion" hint={`${def.label} builds are downloaded automatically on first start.`}>
                    <VersionPicker id="mcVersion" value={form.mcVersion} onChange={(v) => set("mcVersion", v)} />
                  </Field>
                ) : (
                  <Field label="Version" hint={isProxySoftware(form.software) ? `The latest ${SOFTWARE[form.software].label} build is used.` : "Defined by your Docker image."}>
                    <Input disabled value={isProxySoftware(form.software) ? "Latest" : "From image"} />
                  </Field>
                )}
                <Field
                  label="Java version"
                  htmlFor="java"
                  hint={form.javaTouched ? "Manually selected." : `Recommended for ${form.mcVersion === "LATEST" ? "the latest release" : form.mcVersion}.`}
                >
                  <Select
                    id="java"
                    disabled={form.software === "CUSTOM"}
                    value={javaVersion}
                    onValueChange={(v) => setForm((f) => ({ ...f, javaVersion: v as typeof f.javaVersion, javaTouched: true }))}
                    options={JAVA_VERSIONS.map((v) => ({ value: v, label: `Java ${v}` }))}
                  />
                </Field>
              </div>
            )}

            {current === "Resources" && (
              <>
                <Field label="Memory" hint="Heap size given to the JVM. The container gets a small overhead on top.">
                  <div className="flex flex-wrap gap-1.5">
                    {MEMORY_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set("memoryMb", m)}
                        className={cn(
                          "h-8 rounded-md border px-3 text-[13px] tabular transition-colors",
                          form.memoryMb === m ? "border-primary/60 bg-primary-soft text-primary" : "border-border text-muted hover:border-border-strong hover:text-foreground",
                        )}
                      >
                        {m / 1024} GB
                      </button>
                    ))}
                    <InputGroup
                      suffix="MB"
                      type="number"
                      min={512}
                      step={256}
                      value={form.memoryMb}
                      onChange={(e) => set("memoryMb", Number(e.target.value))}
                      className="w-32"
                    />
                  </div>
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="CPU limit" htmlFor="cpu" hint="Number of CPU cores, e.g. 1.5. Use 0 for unlimited.">
                    <InputGroup
                      id="cpu"
                      suffix="cores"
                      type="number"
                      min={0}
                      step={0.5}
                      value={percentToCores(form.cpuPercent)}
                      onChange={(e) => set("cpuPercent", coresToPercent(Number(e.target.value)))}
                    />
                  </Field>
                  <Field label="Storage" htmlFor="disk" hint={`${formatMb(form.diskMb)} soft quota enforced by the agent.`}>
                    <InputGroup id="disk" suffix="MB" type="number" min={1024} step={1024} value={form.diskMb} onChange={(e) => set("diskMb", Number(e.target.value))} />
                  </Field>
                  {!limits && (
                  <>
                  <Field label="Node" htmlFor="node">
                    <Select
                      id="node"
                      value={form.nodeId}
                      onValueChange={(v) => set("nodeId", v)}
                      options={[
                        { value: "auto", label: "Automatic", description: "Pick the node with the most free memory" },
                        ...nodes.map((n) => ({
                          value: n.id,
                          label: n.name,
                          description: `${formatMb(n.freeMemoryMb)} RAM · ${formatMb(n.freeDiskMb)} disk free`,
                          disabled: n.status !== "ONLINE",
                        })),
                      ]}
                    />
                  </Field>
                  <Field
                    label="Port"
                    htmlFor="port"
                    hint={selectedNode ? `Allowed range ${selectedNode.portRange[0]}–${selectedNode.portRange[1]}.` : "Leave empty to allocate the next free port."}
                  >
                    <Input id="port" type="number" placeholder="Auto" value={form.port} onChange={(e) => set("port", e.target.value)} />
                  </Field>
                  </>
                  )}
                </div>
              </>
            )}

            {current === "Advanced" && (
              <>
                {form.software === "CUSTOM" && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Docker image" htmlFor="image" className="sm:col-span-2">
                      <Input id="image" className="font-mono text-xs" placeholder="ghcr.io/org/minecraft:latest" value={form.customImage} onChange={(e) => set("customImage", e.target.value)} />
                    </Field>
                    <Field label="Startup command" htmlFor="startup" hint="Optional. Runs via /bin/sh -c inside the container." className="sm:col-span-2">
                      <Input id="startup" className="font-mono text-xs" placeholder="java -Xmx4G -jar server.jar nogui" value={form.startupCommand} onChange={(e) => set("startupCommand", e.target.value)} />
                    </Field>
                    <Field label="Container port" htmlFor="internalPort" hint="Port your image listens on.">
                      <Input id="internalPort" type="number" value={form.internalPort} onChange={(e) => set("internalPort", e.target.value)} />
                    </Field>
                  </div>
                )}
                {form.software !== "CUSTOM" && (
                  <Field label="JVM flags">
                    <JvmFlagsField
                      value={form.jvmArgs}
                      onChange={(v) => set("jvmArgs", v)}
                      memoryMb={form.memoryMb}
                      javaVersion={javaVersion}
                      proxy={isProxySoftware(form.software)}
                    />
                  </Field>
                )}
                <Field label="Environment variables" hint={form.software !== "CUSTOM" ? "Passed to the itzg/minecraft-server image, e.g. DIFFICULTY=hard or MOTD." : undefined}>
                  <EnvEditor rows={env} onChange={setEnv} />
                </Field>
              </>
            )}

            {current === "Review" && (
              <>
                <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                  <div className="divide-y divide-border">
                    <KeyValue label="Name">{form.name || "—"}</KeyValue>
                    <KeyValue label="Software">
                      <span className="inline-flex items-center gap-1.5">
                        <SoftwareIcon software={form.software} /> {def.label}
                      </span>
                    </KeyValue>
                    <KeyValue label="Version">{def.usesMinecraftVersion ? form.mcVersion : "—"}</KeyValue>
                    <KeyValue label="Java">{form.software === "CUSTOM" ? "From image" : `Java ${javaVersion}`}</KeyValue>
                    <KeyValue label="JVM flags">
                      {(() => {
                        const id = detectPreset(form.jvmArgs, { memoryMb: form.memoryMb, javaVersion });
                        return id ? JVM_PRESETS.find((p) => p.id === id)?.label : form.jvmArgs.trim() ? "Custom" : "Default";
                      })()}
                    </KeyValue>
                  </div>
                  <div className="divide-y divide-border">
                    <KeyValue label="Memory">{formatMb(form.memoryMb)}</KeyValue>
                    <KeyValue label="CPU">{formatCores(form.cpuPercent)}</KeyValue>
                    <KeyValue label="Storage">{formatMb(form.diskMb)}</KeyValue>
                    <KeyValue label="Node">{selectedNode?.name ?? "Automatic"}</KeyValue>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2/50 px-4 py-3">
                  <div>
                    <div className="text-[13px] font-medium">Start after installation</div>
                    <div className="text-xs text-muted">Boot the server as soon as the image is ready.</div>
                  </div>
                  <Switch checked={form.startOnCreate} onCheckedChange={(v) => set("startOnCreate", v)} />
                </div>
                {Object.values(errors).length > 0 && (
                  <div className="flex flex-col gap-1">
                    {Object.entries(errors).map(([k, v]) => (
                      <Badge key={k} tone="danger" className="w-fit">
                        {k}: {v}
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft /> Back
            </Button>
            <div className="flex items-center gap-3">
              {errors[current] && <span className="text-xs text-danger">{errors[current]}</span>}
              {step < STEPS.length - 1 ? (
                <Button variant="primary" disabled={!!errors[current]} onClick={() => setStep((s) => s + 1)}>
                  Continue <ArrowRight />
                </Button>
              ) : (
                <Button variant="primary" loading={submitting} disabled={Object.keys(errors).length > 0} onClick={submit}>
                  <Rocket /> Create server
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

const STEP_TITLES: Record<(typeof STEPS)[number], string> = {
  Software: "Choose your software",
  Version: "Pick a version",
  Resources: "Allocate resources",
  Advanced: "Advanced configuration",
  Review: "Review and create",
};

const STEP_DESCRIPTIONS: Record<(typeof STEPS)[number], string> = {
  Software: "Name your server and select the platform it runs on.",
  Version: "Select the Minecraft and Java versions.",
  Resources: "Define limits and where the server will be hosted.",
  Advanced: "Fine-tune the runtime. Everything here is optional.",
  Review: "Double-check everything before provisioning.",
};
