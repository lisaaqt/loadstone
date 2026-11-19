"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ChevronRight, Download, Eraser, Search, WifiOff } from "lucide-react";
import type { ConsoleServerMessage } from "@loadstone/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/misc";
import { detectLevel, parseAnsi, type LogLevel } from "./ansi";

const MAX_LINES = 3000;
const HISTORY_LIMIT = 100;

interface Line {
  id: number;
  text: string;
  level: LogLevel;
}

const LEVEL_CLASS: Record<LogLevel, string> = {
  error: "text-[#ff8a92]",
  warn: "text-[#f5c869]",
  info: "text-[#cfcfd8]",
  debug: "text-[#7c7c88]",
  command: "text-[#b3a1ff]",
  system: "text-[#7ee6ec]",
};

const chromeButton = "text-console-muted hover:bg-white/[0.07] hover:text-console-fg dark:hover:bg-white/[0.07]";

const LEVEL_BAR: Partial<Record<LogLevel, string>> = {
  error: "bg-danger",
  warn: "bg-warning",
  command: "bg-primary",
};

type ConnState = "connecting" | "open" | "closed";

export function Console({ serverId, running }: { serverId: string; running: boolean }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState("");
  const [level, setLevel] = useState<"all" | "warn" | "error">("all");
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const historyKey = `loadstone:console-history:${serverId}`;

  const append = useCallback((texts: string[]) => {
    setLines((prev) => {
      const next = prev.concat(texts.map((text) => ({ id: idRef.current++, text, level: detectLevel(text) })));
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(historyKey) ?? "[]") as string[]);
    } catch {
      setHistory([]);
    }
  }, [historyKey]);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const connect = () => {
      setConn("connecting");
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/servers/${serverId}/console`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempts = 0;
        setConn("open");
        setLines([]);
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as ConsoleServerMessage;
          if (msg.type === "log") append(msg.lines);
          else if (msg.type === "error") append([`[Loadstone] ${msg.message}`]);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        setConn("closed");
        attempts++;
        retry = setTimeout(connect, Math.min(10_000, 1000 * 2 ** Math.min(attempts, 4)));
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [serverId, append]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, autoScroll]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom !== autoScroll) setAutoScroll(atBottom);
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const command = input.trim().replace(/^\//, "");
    if (!command || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "command", command }));
    const next = [command, ...history.filter((h) => h !== command)].slice(0, HISTORY_LIMIT);
    setHistory(next);
    localStorage.setItem(historyKey, JSON.stringify(next));
    setHistoryIndex(-1);
    setInput("");
    setAutoScroll(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const i = Math.min(historyIndex + 1, history.length - 1);
      if (i >= 0) {
        setHistoryIndex(i);
        setInput(history[i] ?? "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const i = historyIndex - 1;
      setHistoryIndex(Math.max(-1, i));
      setInput(i >= 0 ? (history[i] ?? "") : "");
    }
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return lines.filter((l) => {
      if (level === "error" && l.level !== "error") return false;
      if (level === "warn" && l.level !== "warn" && l.level !== "error") return false;
      return !q || l.text.toLowerCase().includes(q);
    });
  }, [lines, filter, level]);

  return (
    <div className="flex h-[calc(100vh-15rem)] min-h-[420px] flex-col overflow-hidden rounded-xl border border-console-border bg-console shadow-[0_1px_2px_hsl(var(--shadow-color)/0.1),0_16px_40px_-16px_hsl(var(--shadow-color)/0.35)] ring-1 ring-black/5 dark:ring-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-console-border bg-console-chrome px-3 py-2">
        <div className="mr-1 hidden items-center gap-1.5 sm:flex" aria-hidden>
          <span className="size-2.5 rounded-full bg-white/10" />
          <span className="size-2.5 rounded-full bg-white/10" />
          <span className="size-2.5 rounded-full bg-white/10" />
        </div>
        <div className="flex items-center gap-2 text-xs text-console-muted">
          <StatusDot tone={conn === "open" ? "success" : conn === "connecting" ? "warning" : "danger"} pulse={conn === "connecting"} />
          {conn === "open" ? "Connected" : conn === "connecting" ? "Connecting…" : "Disconnected"}
          {!running && conn === "open" && <Badge className="ml-1 border-white/10 bg-white/[0.05] text-console-muted">Server offline</Badge>}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-console-faint" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter"
              className="h-7 w-36 rounded-md border border-white/[0.09] bg-white/[0.04] pl-6 pr-2 text-xs text-console-fg outline-none transition-colors placeholder:text-console-faint focus:border-primary/60 focus:ring-[3px] focus:ring-primary/20"
            />
          </div>
          <Select
            size="sm"
            value={level}
            onValueChange={(v) => setLevel(v as typeof level)}
            className="w-28 border-white/[0.09] bg-white/[0.04] text-console-fg shadow-none hover:border-white/20 dark:bg-white/[0.04]"
            options={[
              { value: "all", label: "All levels" },
              { value: "warn", label: "Warnings+" },
              { value: "error", label: "Errors" },
            ]}
          />
          <Tooltip content="Clear view">
            <Button size="icon-sm" variant="ghost" className={chromeButton} onClick={() => setLines([])} aria-label="Clear console">
              <Eraser />
            </Button>
          </Tooltip>
          <Tooltip content="Download logs">
            <Button size="icon-sm" variant="ghost" className={chromeButton} asChild>
              <a href={`/api/servers/${serverId}/logs`} download aria-label="Download logs">
                <Download />
              </a>
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="absolute inset-0 overflow-y-auto py-2 font-mono text-[12px] leading-[1.65] [scrollbar-color:rgb(255_255_255/0.15)_transparent]"
        >
          {visible.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-console-faint">
              {conn === "closed" ? <WifiOff className="size-4" /> : null}
              {conn === "closed" ? "Console disconnected, reconnecting…" : running ? "Waiting for output…" : "No output yet. Start the server to see its console."}
            </div>
          )}
          {visible.map((line) => (
            <LogLine key={line.id} line={line} />
          ))}
        </div>
        {!autoScroll && (
          <button
            onClick={() => setAutoScroll(true)}
            className="absolute bottom-3 right-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1d1d24] px-3 py-1 text-xs text-console-fg shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)] transition-colors hover:bg-[#26262e]"
          >
            <ArrowDown className="size-3" /> Jump to latest
          </button>
        )}
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-console-border bg-console-chrome px-3 focus-within:bg-[color-mix(in_oklab,var(--console-chrome)_92%,var(--primary))]">
        <ChevronRight className="size-3.5 text-[#b3a1ff]" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setHistoryIndex(-1);
          }}
          onKeyDown={onKeyDown}
          disabled={conn !== "open"}
          maxLength={1024}
          spellCheck={false}
          autoComplete="off"
          placeholder={running ? "Type a command… (↑ for history)" : "Server is offline"}
          className="h-11 flex-1 bg-transparent font-mono text-[12.5px] text-console-fg outline-none placeholder:text-console-faint disabled:opacity-60"
        />
      </form>
    </div>
  );
}

const LogLine = memo(function LogLine({ line }: { line: Line }) {
  const segments = useMemo(() => parseAnsi(line.text), [line.text]);
  const bar = LEVEL_BAR[line.level];
  return (
    <div className={cn("relative whitespace-pre-wrap break-all px-4 hover:bg-white/[0.03]", LEVEL_CLASS[line.level])}>
      {bar && <span className={cn("absolute inset-y-0 left-0 w-0.5 opacity-70", bar)} />}
      {segments.map((s, i) => (
        <span key={i} style={s.color ? { color: s.color } : undefined} className={s.bold ? "font-semibold" : undefined}>
          {s.text}
        </span>
      ))}
    </div>
  );
});
