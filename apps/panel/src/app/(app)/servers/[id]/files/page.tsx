"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useServer } from "@/components/servers/use-server";
import { FileBrowser } from "@/components/files/file-browser";
import { FileEditor } from "@/components/files/file-editor";

function FilesInner() {
  const server = useServer();
  const params = useSearchParams();
  const edit = params.get("edit");
  if (edit) return <FileEditor serverId={server.id} path={edit} />;
  return <FileBrowser serverId={server.id} path={params.get("path") ?? "/"} />;
}

export default function FilesPage() {
  return (
    <Suspense>
      <FilesInner />
    </Suspense>
  );
}
