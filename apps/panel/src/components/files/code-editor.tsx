"use client";

import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";

loader.config({ paths: { vs: "/monaco/vs" } });

const LANGS: Record<string, string> = {
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  json5: "json",
  mcmeta: "json",
  properties: "ini",
  toml: "ini",
  conf: "ini",
  cfg: "ini",
  ini: "ini",
  sh: "shell",
  bat: "bat",
  js: "javascript",
  ts: "typescript",
  xml: "xml",
  html: "html",
  md: "markdown",
  css: "css",
  sk: "python",
  py: "python",
  lua: "lua",
};

export function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGS[ext] ?? "plaintext";
}

let themesDefined = false;

export function CodeEditor({
  path,
  value,
  onChange,
  onSave,
}: {
  path: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const handleMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSave());
  };
  return (
    <Editor
      path={path}
      value={value}
      language={languageFor(path)}
      theme={resolvedTheme === "light" ? "loadstone-light" : "loadstone-dark"}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      beforeMount={(monaco) => {
        if (themesDefined) return;
        themesDefined = true;
        monaco.editor.defineTheme("loadstone-dark", {
          base: "vs-dark",
          inherit: true,
          rules: [],
          colors: {
            "editor.background": "#0f0f14",
            "editor.lineHighlightBackground": "#17171e",
            "editor.lineHighlightBorder": "#17171e",
            "editorLineNumber.foreground": "#3f3f4a",
            "editorLineNumber.activeForeground": "#9e9eac",
            "editor.selectionBackground": "#8f6dff40",
            "editorCursor.foreground": "#a187ff",
            "editorWidget.background": "#18181f",
            "editorWidget.border": "#2b2b35",
            "editorIndentGuide.background1": "#1f1f27",
          },
        });
        monaco.editor.defineTheme("loadstone-light", {
          base: "vs",
          inherit: true,
          rules: [],
          colors: {
            "editor.background": "#ffffff",
            "editor.lineHighlightBackground": "#f6f6f9",
            "editor.lineHighlightBorder": "#f6f6f9",
            "editorLineNumber.foreground": "#b4b4c0",
            "editorLineNumber.activeForeground": "#5b5b6b",
            "editor.selectionBackground": "#6d42f526",
            "editorCursor.foreground": "#6d42f5",
            "editorWidget.background": "#ffffff",
            "editorWidget.border": "#e2e2ea",
            "editorIndentGuide.background1": "#ececf2",
          },
        });
      }}
      options={{
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: "line",
        tabSize: 2,
        automaticLayout: true,
        wordWrap: "on",
      }}
      loading={<div className="flex h-full items-center justify-center text-xs text-muted">Loading editor…</div>}
    />
  );
}
