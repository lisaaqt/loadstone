"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Download, Save } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/misc";
import { dirname } from "./paths";

const CodeEditor = dynamic(() => import("./code-editor").then((m) => m.CodeEditor), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

export function FileEditor({ serverId, path }: { serverId: string; path: string }) {
  const router = useRouter();
  const key = `/api/servers/${serverId}/files/content?path=${encodeURIComponent(path)}`;
  const { data, error, isLoading, mutate } = useSWR<{ content: string }>(key, { revalidateOnFocus: false });
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = value !== null && data !== undefined && value !== data.content;

  useEffect(() => {
    if (data && value === null) setValue(data.content);
  }, [data, value]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function save() {
    if (value === null) return;
    setSaving(true);
    try {
      await api(`/api/servers/${serverId}/files/write`, { body: { path, content: value } });
      await mutate({ content: value }, { revalidate: false });
      toast.success("File saved");
    } catch (err) {
      toast.error("Could not save file", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  function back() {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    router.push(`/servers/${serverId}/files?path=${encodeURIComponent(dirname(path))}`);
  }

  return (
    <div className="flex h-[calc(100vh-15rem)] min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="ghost" size="sm" onClick={back}>
          <ArrowLeft /> Back
        </Button>
        <span className="truncate font-mono text-xs text-muted">{path}</span>
        {dirty && <Badge tone="warning">Unsaved</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 text-xs text-subtle sm:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>S</Kbd>
          </span>
          <Button variant="ghost" size="sm" asChild>
            <a href={`/api/servers/${serverId}/files/download?path=${encodeURIComponent(path)}`}>
              <Download /> Download
            </a>
          </Button>
          <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!dirty}>
            <Save /> Save
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {error ? (
          <div className="flex h-full items-center justify-center text-[13px] text-danger">{errorMessage(error)}</div>
        ) : isLoading || value === null ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : (
          <CodeEditor path={path} value={value} onChange={setValue} onSave={save} />
        )}
      </div>
    </div>
  );
}
