"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { ArrowUpCircle, MoreHorizontal, Package, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { SOFTWARE } from "@loadstone/shared";
import { api, errorMessage, uploadWithProgress } from "@/lib/client";
import { formatBytes, timeAgo } from "@/lib/format";
import { useServer } from "@/components/servers/use-server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/layout";
import { Progress, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { AddonBrowser, AddonIcon, InstallDialog } from "@/components/plugins/addon-browser";

interface Installed {
  fileName: string;
  enabled: boolean;
  size: number;
  modifiedAt: string;
  source: "MODRINTH" | "HANGAR" | "UPLOAD";
  name: string;
  projectId: string | null;
  versionId: string | null;
  versionName: string | null;
  iconUrl: string | null;
}

interface UpdateInfo {
  fileName: string;
  currentVersion: string | null;
  compatible: boolean | null;
  latest: { id: string; versionNumber: string } | null;
}

export default function PluginsPage() {
  const server = useServer();
  const def = SOFTWARE[server.software];
  const base = `/api/servers/${server.id}/plugins`;
  const { data, isLoading, error, mutate } = useSWR<{ directory: string | null; installed: Installed[] }>(base);
  const { data: updates, mutate: refreshUpdates, isValidating: checking } = useSWR<{ updates: UpdateInfo[] }>(def.addonDirectory ? `${base}/updates` : null, {
    revalidateOnFocus: false,
  });
  const [remove, setRemove] = useState<Installed | null>(null);
  const [updating, setUpdating] = useState<Installed | null>(null);
  const [upload, setUpload] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const noun = def.addonKind === "mod" ? "mods" : "plugins";
  const updateMap = new Map(updates?.updates.map((u) => [u.fileName, u]));
  const installedProjects = new Set((data?.installed ?? []).map((i) => i.projectId).filter(Boolean) as string[]);

  const refresh = () => {
    void mutate();
    void refreshUpdates();
  };

  async function uploadJar(file: File) {
    setUpload(0);
    try {
      await uploadWithProgress(`${base}/upload?file=${encodeURIComponent(file.name)}`, file, setUpload);
      toast.success(`Uploaded ${file.name}`);
      refresh();
    } catch (err) {
      toast.error("Upload failed", { description: errorMessage(err) });
    } finally {
      setUpload(null);
    }
  }

  async function toggle(p: Installed, enabled: boolean) {
    try {
      await api(base, { method: "PATCH", body: { fileName: p.fileName, enabled } });
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (!def.addonDirectory) {
    return (
      <Card>
        <EmptyState icon={Package} title={`${def.label} servers don't support plugins or mods`} description="Change the server software to Paper, Purpur, Fabric, Forge or another loader to manage addons." />
      </Card>
    );
  }

  return (
    <Tabs defaultValue="installed">
      <div className="mb-3 flex items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="installed">Installed {data && <span className="text-subtle">{data.installed.length}</span>}</TabsTrigger>
          <TabsTrigger value="browse">Browse</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={refresh} loading={checking}>
            <RefreshCw /> Check updates
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} loading={upload !== null}>
            <Upload /> Upload .jar
          </Button>
          <input ref={fileInput} type="file" accept=".jar" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadJar(e.target.files[0])} />
        </div>
      </div>
      {upload !== null && <Progress value={upload} className="mb-3" />}

      <TabsContent value="installed">
        <Card>
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : error ? (
            <EmptyState icon={Package} title={`Could not load ${noun}`} description={errorMessage(error)} />
          ) : !data?.installed.length ? (
            <EmptyState icon={Package} title={`No ${noun} installed`} description={`Browse Modrinth${def.hangarPlatform ? " and Hangar" : ""} or upload a .jar file into /${def.addonDirectory}.`} />
          ) : (
            <ul className="divide-y divide-border">
              {data.installed.map((p) => {
                const u = updateMap.get(p.fileName);
                return (
                  <li key={p.fileName} className="flex items-center gap-3 px-4 py-3">
                    <AddonIcon url={p.iconUrl} name={p.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[13px] font-medium">
                        <span className="truncate">{p.name}</span>
                        <Badge>{p.source === "UPLOAD" ? "Manual" : p.source === "MODRINTH" ? "Modrinth" : "Hangar"}</Badge>
                        {u?.compatible === false && <Badge tone="warning">Not listed for {server.mcVersion}</Badge>}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {p.versionName ? `v${p.versionName} · ` : ""}
                        {p.fileName} · {formatBytes(p.size)} · {timeAgo(p.modifiedAt)}
                      </div>
                    </div>
                    {u?.latest && p.projectId && (
                      <Button size="sm" variant="outline" onClick={() => setUpdating(p)}>
                        <ArrowUpCircle className="text-primary" /> {u.latest.versionNumber}
                      </Button>
                    )}
                    <Tooltip content={p.enabled ? "Enabled" : "Disabled"}>
                      <span>
                        <Switch checked={p.enabled} onCheckedChange={(v) => void toggle(p, v)} aria-label="Toggle" />
                      </span>
                    </Tooltip>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" aria-label="Actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {p.projectId && (
                          <DropdownMenuItem onSelect={() => setUpdating(p)}>
                            <ArrowUpCircle /> Change version
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem destructive onSelect={() => setRemove(p)}>
                          <Trash2 /> Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="browse">
        <Card className="overflow-hidden">
          <AddonBrowser serverId={server.id} software={server.software} mcVersion={server.mcVersion} installedProjects={installedProjects} onInstalled={refresh} />
        </Card>
      </TabsContent>

      {updating?.projectId && (
        <InstallDialog
          project={{ source: updating.source as "MODRINTH" | "HANGAR", id: updating.projectId, name: updating.name, iconUrl: updating.iconUrl, url: "#" }}
          serverId={server.id}
          software={server.software}
          version={server.mcVersion === "LATEST" ? "" : server.mcVersion}
          replaces={updating.fileName}
          onClose={() => setUpdating(null)}
          onInstalled={() => {
            setUpdating(null);
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={remove !== null}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Remove ${remove?.name}?`}
        description={`${remove?.fileName} will be deleted from /${def.addonDirectory}. Its configuration folder is kept.`}
        confirmLabel="Remove"
        destructive
        loading={busy}
        onConfirm={async () => {
          if (!remove) return;
          setBusy(true);
          try {
            await api(`${base}?file=${encodeURIComponent(remove.fileName)}`, { method: "DELETE" });
            toast.success(`Removed ${remove.name}`);
            setRemove(null);
            refresh();
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Tabs>
  );
}
