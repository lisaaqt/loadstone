"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { Check, Download, Globe, MoreHorizontal, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { WorldInfo } from "@loadstone/shared";
import { api, errorMessage, uploadWithProgress } from "@/lib/client";
import { formatBytes, timeAgo } from "@/lib/format";
import { useServer } from "@/components/servers/use-server";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/layout";
import { Progress, Skeleton } from "@/components/ui/misc";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";

export default function WorldsPage() {
  const server = useServer();
  const base = `/api/servers/${server.id}/worlds`;
  const { data, error, isLoading, mutate } = useSWR<{ worlds: WorldInfo[]; active: string }>(base);
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function activate(name: string) {
    try {
      await api(base, { body: { action: "activate", name } });
      toast.success(`${name} is now the active world`, { description: server.state === "RUNNING" ? "Restart the server to load it." : undefined });
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api(base, { body: { action: "delete", name: toDelete } });
      toast.success(`Deleted ${toDelete}`);
      setToDelete(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Worlds"
        description="Worlds are folders containing a level.dat. The active world is set via level-name in server.properties."
        actions={
          <Button variant="primary" size="sm" onClick={() => setImportOpen(true)}>
            <Upload /> Import world
          </Button>
        }
      />
      {isLoading ? (
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : error ? (
        <EmptyState icon={Globe} title="Could not load worlds" description={errorMessage(error)} />
      ) : !data?.worlds.length ? (
        <EmptyState icon={Globe} title="No worlds yet" description="A world is generated on first start, or you can import one from a .zip archive." />
      ) : (
        <ul className="divide-y divide-border">
          {data.worlds.map((w) => {
            const active = w.name === data.active;
            return (
              <li key={w.name} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-8 items-center justify-center rounded-md border border-border bg-surface-2">
                  <Globe className={active ? "size-4 text-primary" : "size-4 text-muted"} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    {w.name}
                    {active && <Badge tone="primary">Active</Badge>}
                  </div>
                  <div className="text-xs text-muted">
                    {formatBytes(w.sizeBytes)} · {w.dimensions.join(", ") || "overworld"} · modified {timeAgo(w.modifiedAt)}
                  </div>
                </div>
                {!active && (
                  <Button size="sm" variant="outline" onClick={() => activate(w.name)}>
                    <Check /> Set active
                  </Button>
                )}
                <Button size="sm" variant="ghost" asChild>
                  <a href={`${base}?export=${encodeURIComponent(w.name)}`}>
                    <Download /> Export
                  </a>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label="World actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem asChild>
                      <a href={`/servers/${server.id}/files?path=${encodeURIComponent(`/${w.name}`)}`}>Browse files</a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive disabled={active && server.state !== "OFFLINE"} onSelect={() => setToDelete(w.name)}>
                      <Trash2 /> Delete world
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} url={base} onDone={() => void mutate()} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete}?`}
        description="The world folder and all of its region data will be permanently removed. Consider creating a backup first."
        confirmLabel="Delete world"
        destructive
        loading={busy}
        onConfirm={remove}
      />
    </Card>
  );
}

function ImportDialog({ open, onOpenChange, url, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; url: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name.trim()) return;
    setProgress(0);
    try {
      await uploadWithProgress(`${url}?import=${encodeURIComponent(name.trim())}`, file, setProgress);
      toast.success(`Imported ${name}`);
      onOpenChange(false);
      setFile(null);
      setName("");
      onDone();
    } catch (err) {
      toast.error("Import failed", { description: errorMessage(err) });
    } finally {
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Import world" description="Upload a .zip containing a world folder (with level.dat).">
        <form onSubmit={submit}>
          <DialogBody>
            <Field label="World name" htmlFor="world-name" hint="The folder name the world will be extracted into.">
              <Input id="world-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="world_backup" />
            </Field>
            <Field label="Archive">
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong text-xs text-muted transition-colors hover:border-primary/60 hover:text-foreground"
              >
                <Upload className="size-4" />
                {file ? `${file.name} · ${formatBytes(file.size)}` : "Choose a .zip file"}
              </button>
              <input
                ref={input}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !name) setName(f.name.replace(/\.zip$/i, "").replace(/[^A-Za-z0-9_\-. ]/g, "_"));
                }}
              />
            </Field>
            {progress !== null && <Progress value={progress} />}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={progress !== null} disabled={!file || !name.trim()}>
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
