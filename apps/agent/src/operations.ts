import type { OperationStatus } from "@loadstone/shared";
import { conflict } from "./errors.js";

const ops = new Map<string, OperationStatus & { finishedAt?: number }>();

export function startOperation(id: string, kind: OperationStatus["kind"], fn: (progress: (pct: number) => void) => Promise<Partial<OperationStatus>>) {
  const existing = ops.get(id);
  if (existing?.status === "running") throw conflict("Operation already running");
  const op: OperationStatus & { finishedAt?: number } = { id, kind, status: "running", progress: 0 };
  ops.set(id, op);
  const progress = (pct: number) => {
    op.progress = Math.max(op.progress, Math.min(99, Math.round(pct)));
  };
  fn(progress)
    .then((result) => Object.assign(op, result, { status: "completed", progress: 100, finishedAt: Date.now() }))
    .catch((err: unknown) => Object.assign(op, { status: "failed", error: err instanceof Error ? err.message : String(err), finishedAt: Date.now() }));
  return op;
}

export function getOperation(id: string) {
  return ops.get(id) ?? null;
}

setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [id, op] of ops) if (op.finishedAt && op.finishedAt < cutoff) ops.delete(id);
}, 600_000).unref();
