"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Download, ExternalLink, Package, Search } from "lucide-react";
import { toast } from "sonner";
import { SOFTWARE, type SoftwareId } from "@loadstone/shared";
import { api, errorMessage } from "@/lib/client";
import { formatBytes, timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/layout";
import { Skeleton, Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";

export interface AddonProject {
  source: "MODRINTH" | "HANGAR";
  id: string;
  slug: string;
  name: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
  updatedAt: string | null;
  url: string;
  categories: string[];
}

interface AddonVersion {
  id: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  publishedAt: string;
  file: { url: string | null; fileName: string; size: number } | null;
  external: boolean;
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const compact = new Intl.NumberFormat("en", { notation: "compact" });

export function AddonIcon({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  return url ? (
    <Image src={url} alt="" width={size} height={size} unoptimized className="shrink-0 rounded-md border border-border bg-surface-2 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-xs font-semibold text-muted" style={{ width: size, height: size }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AddonBrowser({
  serverId,
  software,
  mcVersion,
  installedProjects,
  onInstalled,
}: {
  serverId: string | null;
  software: SoftwareId;
  mcVersion: string;
  installedProjects?: Set<string>;
  onInstalled?: () => void;
}) {
  const def = SOFTWARE[software];
  const sources = [def.modrinthLoaders.length ? "MODRINTH" : null, def.hangarPlatform ? "HANGAR" : null].filter(Boolean) as ("MODRINTH" | "HANGAR")[];
  const [source, setSource] = useState<"MODRINTH" | "HANGAR">(sources[0] ?? "MODRINTH");
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [selected, setSelected] = useState<AddonProject | null>(null);
  const version = mcVersion === "LATEST" ? "" : mcVersion;

  useEffect(() => {
    if (!sources.includes(source) && sources[0]) setSource(sources[0]);
  }, [software]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, isLoading } = useSWR<{ hits: AddonProject[]; total: number }>(
    sources.length ? `/api/plugins/search?source=${source}&software=${software}&q=${encodeURIComponent(q)}&version=${encodeURIComponent(version)}` : null,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  if (!sources.length) {
    return <EmptyState icon={Package} title={`${def.label} doesn't support plugins or mods`} description="Switch to a plugin or mod loader platform to browse addons." />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${def.addonKind === "mod" ? "mods" : "plugins"}…`} className="pl-8" />
        </div>
        {sources.length > 1 && (
          <Tabs value={source} onValueChange={(v) => setSource(v as typeof source)}>
            <TabsList>
              <TabsTrigger value="MODRINTH">Modrinth</TabsTrigger>
              <TabsTrigger value="HANGAR">Hangar</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <Badge>
          {def.label} {version || "latest"}
        </Badge>
      </div>
      {isLoading && !data ? (
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 bg-surface p-4">
              <Skeleton className="size-9" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={Package} title="Search failed" description={errorMessage(error)} />
      ) : !data?.hits.length ? (
        <EmptyState icon={Search} title="No results" description="Try a different search term." />
      ) : (
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
          {data.hits.map((p) => (
            <div key={`${p.source}-${p.id}`} className="flex gap-3 bg-surface p-4 transition-colors hover:bg-surface-2/40">
              <AddonIcon url={p.iconUrl} name={p.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <a href={p.url} target="_blank" rel="noreferrer noopener" className="truncate text-[13px] font-medium hover:underline">
                    {p.name}
                  </a>
                  {installedProjects?.has(p.id) && <Badge tone="success">Installed</Badge>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{p.description}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-subtle">
                  <span>by {p.author}</span>
                  <span className="inline-flex items-center gap-1">
                    <Download className="size-3" />
                    {compact.format(p.downloads)}
                  </span>
                  {p.updatedAt && <span>updated {timeAgo(p.updatedAt)}</span>}
                </div>
              </div>
              {serverId && (
                <Button size="sm" variant="outline" className="self-start" onClick={() => setSelected(p)}>
                  Install
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {serverId && selected && (
        <InstallDialog
          project={selected}
          serverId={serverId}
          software={software}
          version={version}
          onClose={() => setSelected(null)}
          onInstalled={() => {
            setSelected(null);
            onInstalled?.();
          }}
        />
      )}
    </div>
  );
}

export function InstallDialog({
  project,
  serverId,
  software,
  version,
  replaces,
  onClose,
  onInstalled,
}: {
  project: Pick<AddonProject, "source" | "id" | "name" | "iconUrl" | "url">;
  serverId: string;
  software: SoftwareId;
  version: string;
  replaces?: string;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const { data, error, isLoading } = useSWR<{ versions: AddonVersion[] }>(
    `/api/plugins/search?source=${project.source}&software=${software}&project=${encodeURIComponent(project.id)}&version=${encodeURIComponent(version)}`,
    { revalidateOnFocus: false },
  );
  const [installing, setInstalling] = useState<string | null>(null);

  async function install(v: AddonVersion) {
    setInstalling(v.id);
    try {
      await api(`/api/servers/${serverId}/plugins`, {
        body: { source: project.source, projectId: project.id, versionId: v.id, name: project.name, iconUrl: project.iconUrl, replaces },
      });
      toast.success(`${replaces ? "Updated" : "Installed"} ${project.name} ${v.versionNumber}`, { description: "Restart the server to load it." });
      onInstalled();
    } catch (err) {
      toast.error("Install failed", { description: errorMessage(err) });
    } finally {
      setInstalling(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${replaces ? "Update" : "Install"} ${project.name}`} description={`Versions compatible with ${SOFTWARE[software].label} ${version || "(any version)"}`} size="lg">
        <DialogBody className="max-h-[55vh] overflow-y-auto p-0">
          {isLoading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : error ? (
            <p className="p-5 text-[13px] text-danger">{errorMessage(error)}</p>
          ) : !data?.versions.length ? (
            <p className="p-5 text-[13px] text-muted">No compatible versions were found for this server.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.versions.slice(0, 30).map((v, i) => (
                <li key={v.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      <span className="truncate">{v.versionNumber}</span>
                      {i === 0 && <Badge tone="primary">Latest</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {v.gameVersions.slice(-4).join(", ")} · {v.loaders.join(", ")} · {timeAgo(v.publishedAt)}
                      {v.file && ` · ${formatBytes(v.file.size)}`}
                    </div>
                  </div>
                  {v.external || !v.file?.url ? (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={project.url} target="_blank" rel="noreferrer noopener">
                        External <ExternalLink />
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant={i === 0 ? "primary" : "outline"} loading={installing === v.id} disabled={installing !== null} onClick={() => install(v)}>
                      {replaces ? "Update" : "Install"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
