"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Field, Input, InputGroup, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";

export interface NodeFormValues {
  name: string;
  description: string;
  scheme: "http" | "https";
  host: string;
  port: number;
  publicHost: string;
  memoryMb: number;
  diskMb: number;
  portRangeStart: number;
  portRangeEnd: number;
  extraPorts: number[];
}

const DEFAULTS: NodeFormValues = {
  name: "",
  description: "",
  scheme: "http",
  host: "",
  port: 8080,
  publicHost: "",
  memoryMb: 8192,
  diskMb: 102400,
  portRangeStart: 25565,
  portRangeEnd: 25665,
  extraPorts: [],
};

export function NodeFormDialog({
  open,
  onOpenChange,
  initial,
  nodeId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: NodeFormValues;
  nodeId?: string;
  onSaved: (res: { id: string; token?: string }) => void;
}) {
  const [form, setForm] = useState<NodeFormValues>(initial ?? DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [extraText, setExtraText] = useState((initial ?? DEFAULTS).extraPorts.join(", "));
  useEffect(() => {
    if (open) {
      setForm(initial ?? DEFAULTS);
      setExtraText((initial ?? DEFAULTS).extraPorts.join(", "));
    }
  }, [open, initial]);
  const set = <K extends keyof NodeFormValues>(k: K, v: NodeFormValues[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body = { ...form, description: form.description || null, publicHost: form.publicHost || form.host };
      if (nodeId) {
        await api(`/api/nodes/${nodeId}`, { method: "PATCH", body });
        toast.success("Node updated");
        onSaved({ id: nodeId });
      } else {
        const res = await api<{ node: { id: string }; token: string }>("/api/nodes", { body });
        onSaved({ id: res.node.id, token: res.token });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={nodeId ? "Edit node" : "Add node"} description="The panel connects to the agent over HTTP(S) using a per-node token." size="lg">
        <form onSubmit={submit}>
          <DialogBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="node-name">
                <Input id="node-name" autoFocus required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="eu-west-1" />
              </Field>
              <Field label="Public address" htmlFor="node-public" hint="Hostname players connect to.">
                <Input id="node-public" value={form.publicHost} onChange={(e) => set("publicHost", e.target.value)} placeholder={form.host || "play.example.com"} />
              </Field>
            </div>
            <div className="grid grid-cols-[110px_1fr_110px] gap-2">
              <Field label="Scheme">
                <Select value={form.scheme} onValueChange={(v) => set("scheme", v as "http" | "https")} options={[{ value: "http", label: "http" }, { value: "https", label: "https" }]} />
              </Field>
              <Field label="Agent host" htmlFor="node-host" hint="Reachable from the panel only. Keep it on a private network or behind TLS.">
                <Input id="node-host" required value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="10.0.0.12" />
              </Field>
              <Field label="Agent port" htmlFor="node-port">
                <Input id="node-port" type="number" required value={form.port} onChange={(e) => set("port", Number(e.target.value))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Allocatable RAM" htmlFor="node-mem">
                <InputGroup id="node-mem" suffix="MB" type="number" value={form.memoryMb} onChange={(e) => set("memoryMb", Number(e.target.value))} />
              </Field>
              <Field label="Allocatable disk" htmlFor="node-disk">
                <InputGroup id="node-disk" suffix="MB" type="number" value={form.diskMb} onChange={(e) => set("diskMb", Number(e.target.value))} />
              </Field>
              <Field label="Ports from" htmlFor="node-pstart">
                <Input id="node-pstart" type="number" value={form.portRangeStart} onChange={(e) => set("portRangeStart", Number(e.target.value))} />
              </Field>
              <Field label="Ports to" htmlFor="node-pend">
                <Input id="node-pend" type="number" value={form.portRangeEnd} onChange={(e) => set("portRangeEnd", Number(e.target.value))} />
              </Field>
              <Field label="Additional ports" htmlFor="node-extra" hint="Single ports outside the range, comma-separated (e.g. 25565)." className="sm:col-span-2">
                <Input
                  id="node-extra"
                  placeholder="25565, 25577"
                  value={extraText}
                  onChange={(e) => {
                    setExtraText(e.target.value);
                    set("extraPorts", e.target.value.split(/[s,]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n > 0));
                  }}
                />
              </Field>
            </div>
            <Field label="Description" htmlFor="node-desc">
              <Textarea id="node-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              {nodeId ? "Save changes" : "Add node"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CopyBlock({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
        {label}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-foreground">{value}</pre>
    </div>
  );
}

export function TokenDialog({ token, nodeId, agentImage, onClose }: { token: string; nodeId: string; agentImage: string; onClose: () => void }) {
  const compose = `docker run -d --name loadstone-agent --restart unless-stopped \\
  --security-opt no-new-privileges:true --read-only --tmpfs /tmp \\
  --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --cap-add SETUID --cap-add SETGID \\
  -p 8080:8080 \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v /var/lib/loadstone:/var/lib/loadstone \\
  -e LOADSTONE_TOKEN=${token} \\
  -e LOADSTONE_NODE_ID=${nodeId} \\
  -e LOADSTONE_DATA_DIR=/var/lib/loadstone \\
  ${agentImage}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Connect the agent" description="This token is shown only once. Store it securely, then start the agent on the node." size="xl">
        <DialogBody>
          <CopyBlock label="Agent token" value={token} />
          <CopyBlock label="Run the agent with Docker" value={compose} />
          {agentImage.includes("/") && agentImage.split("/")[0]!.includes(".") && (
            <p className="text-xs leading-relaxed text-muted">
              The image is in a private registry: run <code className="font-mono">docker login {agentImage.split("/")[0]}</code> on the node first.
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted">
            The data directory must be mounted at the same path on the host and inside the agent container, because the agent creates bind mounts for server containers. Never expose the agent port to the public internet; restrict it to the panel with a firewall or private network.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            I&apos;ve saved the token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
