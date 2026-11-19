"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  Archive,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileCode,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { FileEntry } from "@loadstone/shared";
import { api, errorMessage, uploadWithProgress } from "@/lib/client";
import { formatBytes, formatDate, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Progress, Skeleton } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { isArchive, joinPath } from "./paths";

type Prompt = { kind: "mkdir" | "newfile" | "rename" | "compress"; entry?: FileEntry } | null;

interface UploadState {
  name: string;
  progress: number;
}

export function FileBrowser({ serverId, path }: { serverId: string; path: string }) {
  const router = useRouter();
  const key = `/api/servers/${serverId}/files/list?path=${encodeURIComponent(path)}`;
  const { data, error, isLoading, mutate } = useSWR<{ entries: FileEntry[] }>(key);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [toDelete, setToDelete] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const base = `/api/servers/${serverId}/files`;

  const entries = useMemo(
    () => [...(data?.entries ?? [])].sort((a, b) => (a.type === "directory" ? 0 : 1) - (b.type === "directory" ? 0 : 1) || a.name.localeCompare(b.name)),
    [data],
  );
  const crumbs = path.split("/").filter(Boolean);
  const navigate = (p: string) => {
    setSelected(new Set());
    router.push(`/servers/${serverId}/files?path=${encodeURIComponent(p)}`);
  };

  const open = (e: FileEntry) => {
    if (e.type === "directory") navigate(e.path);
    else if (e.editable) router.push(`/servers/${serverId}/files?edit=${encodeURIComponent(e.path)}`);
    else window.location.href = `${base}/download?path=${encodeURIComponent(e.path)}`;
  };

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      toast.success(label);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  }

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setUploads(list.map((f) => ({ name: f.name, progress: 0 })));
    let ok = 0;
    for (const [i, file] of list.entries()) {
      try {
        await uploadWithProgress(`${base}/upload?path=${encodeURIComponent(joinPath(path, file.name))}`, file, (p) =>
          setUploads((u) => u.map((x, idx) => (idx === i ? { ...x, progress: p } : x))),
        );
        ok++;
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`, { description: errorMessage(err) });
      }
    }
    setUploads([]);
    if (ok) toast.success(`Uploaded ${ok} file${ok === 1 ? "" : "s"}`);
    await mutate();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await run(`Deleted ${toDelete.length} item${toDelete.length === 1 ? "" : "s"}`, () => api(`${base}/delete`, { body: { paths: toDelete } }));
      setSelected(new Set());
      setToDelete(null);
    } catch {
      /* toast shown */
    } finally {
      setDeleting(false);
    }
  }

  const allSelected = entries.length > 0 && selected.size === entries.length;

  return (
    <Card
      className={cn("relative overflow-hidden", dragging && "ring-2 ring-primary/50")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 text-[13px]">
          <button onClick={() => navigate("/")} className="flex items-center rounded px-1.5 py-1 text-muted hover:bg-surface-2 hover:text-foreground">
            <Home className="size-3.5" />
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center">
              <ChevronRight className="size-3 text-subtle" />
              <button
                onClick={() => navigate(`/${crumbs.slice(0, i + 1).join("/")}`)}
                className={cn("truncate rounded px-1.5 py-1 hover:bg-surface-2", i === crumbs.length - 1 ? "text-foreground" : "text-muted")}
              >
                {c}
              </button>
            </span>
          ))}
        </nav>
        {selected.size > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-muted">{selected.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => setPrompt({ kind: "compress" })}>
              <Archive /> Compress
            </Button>
            <Button size="sm" variant="danger-outline" onClick={() => setToDelete([...selected])}>
              <Trash2 /> Delete
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button size="icon-sm" variant="ghost" onClick={() => void mutate()} aria-label="Refresh">
              <RefreshCw />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPrompt({ kind: "newfile" })}>
              <FilePlus /> New file
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPrompt({ kind: "mkdir" })}>
              <FolderPlus /> New folder
            </Button>
            <Button size="sm" variant="primary" onClick={() => fileInput.current?.click()}>
              <Upload /> Upload
            </Button>
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
          </div>
        )}
      </div>

      {uploads.length > 0 && (
        <div className="flex flex-col gap-2 border-b border-border bg-surface-2/50 px-4 py-3">
          {uploads.map((u) => (
            <div key={u.name} className="flex items-center gap-3 text-xs">
              <span className="w-48 truncate text-muted">{u.name}</span>
              <Progress value={u.progress} className="flex-1" />
              <span className="w-10 text-right tabular text-muted">{u.progress}%</span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={FolderOpen} title="Could not load files" description={errorMessage(error)} />
      ) : entries.length === 0 ? (
        <EmptyState icon={FolderOpen} title="This folder is empty" description="Drop files here or use the upload button." />
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-xs text-muted">
              <th className="w-10 py-2 pl-4 text-left">
                <Checkbox
                  checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
                  onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(entries.map((e) => e.path)))}
                  aria-label="Select all"
                />
              </th>
              <th className="py-2 text-left font-medium">Name</th>
              <th className="hidden w-28 py-2 text-right font-medium sm:table-cell">Size</th>
              <th className="hidden w-40 py-2 pr-2 text-right font-medium md:table-cell">Modified</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {path !== "/" && (
              <tr onClick={() => navigate(`/${crumbs.slice(0, -1).join("/")}`)} className="cursor-pointer border-t border-border hover:bg-surface-2/60">
                <td />
                <td colSpan={4} className="py-1.5">
                  <button type="button" className="flex items-center gap-2.5 text-muted hover:text-foreground">
                    <Folder className="size-4" /> ..
                  </button>
                </td>
              </tr>
            )}
            {entries.map((e) => {
              const Icon = e.type === "directory" ? Folder : isArchive(e.name) ? FileArchive : e.editable ? FileCode : File;
              const checked = selected.has(e.path);
              return (
                <tr
                  key={e.path}
                  onClick={() => open(e)}
                  className={cn("group cursor-pointer border-t border-border transition-colors hover:bg-surface-2/60", checked && "bg-primary-soft")}
                >
                  <td className="py-1.5 pl-4" onClick={(ev) => ev.stopPropagation()}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (next.has(e.path)) next.delete(e.path);
                          else next.add(e.path);
                          return next;
                        })
                      }
                      aria-label={`Select ${e.name}`}
                    />
                  </td>
                  <td className="py-1.5">
                    <button type="button" className="flex max-w-full items-center gap-2.5 text-left">
                      <Icon className={cn("size-4 shrink-0", e.type === "directory" ? "text-primary" : "text-muted")} />
                      <span className="truncate group-hover:text-foreground">{e.name}</span>
                    </button>
                  </td>
                  <td className="hidden py-1.5 text-right text-xs text-muted tabular sm:table-cell">{e.type === "directory" ? "—" : formatBytes(e.size)}</td>
                  <td className="hidden py-1.5 pr-2 text-right text-xs text-muted md:table-cell" title={formatDate(e.modifiedAt)}>
                    {timeAgo(e.modifiedAt)}
                  </td>
                  <td className="py-1.5 pr-2 text-right" onClick={(ev) => ev.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" className="opacity-60 group-hover:opacity-100" aria-label="File actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {e.editable && (
                          <DropdownMenuItem asChild>
                            <Link href={`/servers/${serverId}/files?edit=${encodeURIComponent(e.path)}`}>
                              <FileCode /> Edit
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => setPrompt({ kind: "rename", entry: e })}>
                          <Pencil /> Rename / move
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`${base}/download?path=${encodeURIComponent(e.path)}`}>
                            <Download /> {e.type === "directory" ? "Download as zip" : "Download"}
                          </a>
                        </DropdownMenuItem>
                        {e.type === "file" && isArchive(e.name) && (
                          <DropdownMenuItem
                            onSelect={() =>
                              void run(`Extracted ${e.name}`, () => api(`${base}/extract`, { body: { path: e.path, destination: path } })).catch(() => undefined)
                            }
                          >
                            <FolderOpen /> Extract here
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => setToDelete([e.path])}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <PromptDialog
        open={prompt !== null}
        onOpenChange={(o) => !o && setPrompt(null)}
        title={
          prompt?.kind === "mkdir" ? "New folder" : prompt?.kind === "newfile" ? "New file" : prompt?.kind === "compress" ? "Compress selection" : "Rename"
        }
        description={prompt?.kind === "rename" ? "Use a path like ../plugins/name.jar to move the item." : undefined}
        label={prompt?.kind === "compress" ? "Archive name" : "Name"}
        initialValue={prompt?.kind === "rename" ? prompt.entry?.name : prompt?.kind === "compress" ? "archive.zip" : ""}
        confirmLabel={prompt?.kind === "rename" ? "Rename" : "Create"}
        onSubmit={async (value) => {
          const target = value.startsWith("/") ? value : joinPath(path, value);
          if (prompt?.kind === "mkdir") await run("Folder created", () => api(`${base}/mkdir`, { body: { path: target } }));
          else if (prompt?.kind === "newfile") {
            await run("File created", () => api(`${base}/write`, { body: { path: target, content: "" } }));
            router.push(`/servers/${serverId}/files?edit=${encodeURIComponent(target)}`);
          } else if (prompt?.kind === "rename" && prompt.entry) await run("Renamed", () => api(`${base}/rename`, { body: { from: prompt.entry!.path, to: target } }));
          else if (prompt?.kind === "compress") {
            await run("Archive created", () => api(`${base}/compress`, { body: { paths: [...selected], destination: target.endsWith(".zip") ? target : `${target}.zip` } }));
            setSelected(new Set());
          }
        }}
      />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.length === 1 ? "item" : `${toDelete?.length} items`}?`}
        description="This permanently removes the selected files and folders from the server. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </Card>
  );
}
