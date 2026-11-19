"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client";
import { coresToPercent, percentToCores } from "@/lib/format";
import { useServer } from "@/components/servers/use-server";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, InputGroup, Textarea } from "@/components/ui/input";
import { Skeleton, Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";

interface Detail {
  server: {
    name: string;
    description: string | null;
    memoryMb: number;
    cpuPercent: number;
    databaseLimit: number;
    diskMb: number;
    port: number;
    backupRetention: number;
    image: string;
    startupCommand: string | null;
    software: string;
    ownerId: string;
  };
}

export default function ServerSettingsPage() {
  const server = useServer();
  const router = useRouter();
  const { data, mutate } = useSWR<Detail>(`/api/servers/${server.id}`);
  const { data: users } = useSWR<{ users: { id: string; name: string; email: string }[] }>(server.canAdmin ? "/api/users" : null);
  const [general, setGeneral] = useState<{ name: string; description: string; backupRetention: number } | null>(null);
  const [res, setRes] = useState<{ memoryMb: number; cpuPercent: number; diskMb: number; databaseLimit: number; port: number; customImage: string; startupCommand: string; ownerId: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [force, setForce] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reinstallOpen, setReinstallOpen] = useState(false);
  const [reinstallName, setReinstallName] = useState("");
  const [reinstalling, setReinstalling] = useState(false);

  useEffect(() => {
    if (!data) return;
    const s = data.server;
    setGeneral({ name: s.name, description: s.description ?? "", backupRetention: s.backupRetention });
    setRes({ memoryMb: s.memoryMb, cpuPercent: s.cpuPercent, diskMb: s.diskMb, databaseLimit: s.databaseLimit, port: s.port, customImage: s.image, startupCommand: s.startupCommand ?? "", ownerId: s.ownerId });
  }, [data]);

  async function patch(section: string, body: Record<string, unknown>) {
    setSaving(section);
    try {
      const r = await api<{ needsRestart: boolean }>(`/api/servers/${server.id}`, { method: "PATCH", body });
      toast.success("Settings saved", { description: r.needsRestart ? "Restart the server to apply resource changes." : undefined });
      await mutate();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function destroy() {
    setDeleting(true);
    try {
      await api(`/api/servers/${server.id}${force ? "?force=true" : ""}`, { method: "DELETE" });
      toast.success(`Deleted ${server.name}`);
      router.push("/servers");
      router.refresh();
    } catch (err) {
      toast.error("Could not delete server", { description: errorMessage(err) });
      setDeleting(false);
    }
  }

  if (!general || !res || !data) return <Skeleton className="h-64" />;
  const isCustom = data.server.software === "CUSTOM";

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader title="General" />
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
          <Field label="Name" htmlFor="srv-name">
            <Input id="srv-name" value={general.name} onChange={(e) => setGeneral({ ...general, name: e.target.value })} maxLength={48} />
          </Field>
          <Field label="Backup retention" htmlFor="retention" hint="Unlocked backups beyond this count are pruned automatically.">
            <InputGroup id="retention" suffix="backups" type="number" min={1} max={500} value={general.backupRetention} onChange={(e) => setGeneral({ ...general, backupRetention: Number(e.target.value) })} />
          </Field>
          <Field label="Description" htmlFor="srv-desc" className="md:col-span-2">
            <Textarea id="srv-desc" rows={2} value={general.description} onChange={(e) => setGeneral({ ...general, description: e.target.value })} maxLength={280} />
          </Field>
        </div>
        <CardFooter>
          <Button
            variant="primary"
            loading={saving === "general"}
            onClick={() => patch("general", { name: general.name, description: general.description || null, backupRetention: general.backupRetention })}
          >
            <Save /> Save
          </Button>
        </CardFooter>
      </Card>

      {server.canAdmin && (
        <Card>
          <CardHeader title="Resources & allocation" description="Administrator only. Changes apply on the next start or restart." />
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Memory" htmlFor="mem">
              <InputGroup id="mem" suffix="MB" type="number" min={512} step={256} value={res.memoryMb} onChange={(e) => setRes({ ...res, memoryMb: Number(e.target.value) })} />
            </Field>
            <Field label="CPU limit" htmlFor="cpu" hint="Cores, e.g. 1.5. 0 = unlimited">
              <InputGroup
                id="cpu"
                suffix="cores"
                type="number"
                min={0}
                step={0.5}
                value={percentToCores(res.cpuPercent)}
                onChange={(e) => setRes({ ...res, cpuPercent: coresToPercent(Number(e.target.value)) })}
              />
            </Field>
            <Field label="Databases" htmlFor="dblimit" hint="How many databases this server may create">
              <Input id="dblimit" type="number" min={0} max={100} value={res.databaseLimit} onChange={(e) => setRes({ ...res, databaseLimit: Number(e.target.value) })} />
            </Field>
            <Field label="Storage" htmlFor="disk">
              <InputGroup id="disk" suffix="MB" type="number" min={1024} step={1024} value={res.diskMb} onChange={(e) => setRes({ ...res, diskMb: Number(e.target.value) })} />
            </Field>
            <Field label="Port" htmlFor="port">
              <Input id="port" type="number" value={res.port} onChange={(e) => setRes({ ...res, port: Number(e.target.value) })} />
            </Field>
            {users && (
              <Field label="Owner" className="md:col-span-2">
                <Select value={res.ownerId} onValueChange={(v) => setRes({ ...res, ownerId: v })} options={users.users.map((u) => ({ value: u.id, label: u.name, description: u.email }))} />
              </Field>
            )}
            {isCustom && (
              <>
                <Field label="Docker image" htmlFor="img" className="md:col-span-2">
                  <Input id="img" className="font-mono text-xs" value={res.customImage} onChange={(e) => setRes({ ...res, customImage: e.target.value })} />
                </Field>
                <Field label="Startup command" htmlFor="startup" className="md:col-span-2 lg:col-span-4">
                  <Input id="startup" className="font-mono text-xs" value={res.startupCommand} onChange={(e) => setRes({ ...res, startupCommand: e.target.value })} />
                </Field>
              </>
            )}
          </div>
          <CardFooter>
            <Button
              variant="primary"
              loading={saving === "resources"}
              onClick={() =>
                patch("resources", {
                  memoryMb: res.memoryMb,
                  cpuPercent: res.cpuPercent,
                  databaseLimit: res.databaseLimit,
                  diskMb: res.diskMb,
                  port: res.port,
                  ownerId: res.ownerId,
                  ...(isCustom ? { customImage: res.customImage, startupCommand: res.startupCommand || null } : {}),
                })
              }
            >
              <Save /> Save resources
            </Button>
          </CardFooter>
        </Card>
      )}

      {server.canManage && (
        <Card className="border-danger/30">
          <CardHeader title="Danger zone" />
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between gap-4 p-4">
              <div>
                <div className="text-[13px] font-medium">Reinstall this server</div>
                <div className="text-xs text-muted">
                  Wipes every file (worlds, plugins, configs) and installs the server again from scratch. Backups are kept.
                </div>
              </div>
              <Button variant="danger-outline" onClick={() => setReinstallOpen(true)}>
                <RotateCcw /> Reinstall
              </Button>
            </div>
            {server.canAdmin && (
              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="text-[13px] font-medium">Delete this server</div>
                  <div className="text-xs text-muted">Removes the container, all files and local backups from the node. This cannot be undone.</div>
                </div>
                <Button variant="danger-outline" onClick={() => setDeleteOpen(true)}>
                  <Trash2 /> Delete server
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={reinstallOpen}
        onOpenChange={setReinstallOpen}
        title={`Reinstall ${server.name}?`}
        description="Type the server name to confirm. All server files are deleted and a fresh server is installed and started. Backups are kept."
        confirmLabel="Wipe and reinstall"
        destructive
        loading={reinstalling}
        onConfirm={async () => {
          if (reinstallName !== server.name) return void toast.error("The name does not match");
          setReinstalling(true);
          try {
            await api(`/api/servers/${server.id}/reinstall`, { method: "POST" });
            toast.success("Reinstall started", { description: "The server is wiped and installed again from scratch." });
            setReinstallOpen(false);
            setReinstallName("");
            router.push(`/servers/${server.id}`);
            router.refresh();
          } catch (err) {
            toast.error("Could not reinstall", { description: errorMessage(err) });
          } finally {
            setReinstalling(false);
          }
        }}
      >
        <Input value={reinstallName} onChange={(e) => setReinstallName(e.target.value)} placeholder={server.name} />
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${server.name}?`}
        description="Type the server name to confirm. Everything on the node for this server will be permanently destroyed."
        confirmLabel="Delete forever"
        destructive
        loading={deleting}
        onConfirm={async () => {
          if (confirmName === server.name) await destroy();
          else toast.error("The name does not match");
        }}
      >
        <div className="flex flex-col gap-3">
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={server.name} />
          <label className="flex items-center justify-between gap-3 text-xs text-muted">
            Force delete even if the node is unreachable
            <Switch checked={force} onCheckedChange={setForce} />
          </label>
        </div>
      </ConfirmDialog>
    </div>
  );
}
