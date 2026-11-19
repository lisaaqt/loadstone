import type { ServerState } from "@/generated/prisma/client";
import type { ServerRuntimeState } from "@loadstone/shared";
import type { Tone } from "@/components/ui/badge";

const META: Record<ServerState, { label: string; tone: Tone; pulse?: boolean }> = {
  INSTALLING: { label: "Installing", tone: "info", pulse: true },
  OFFLINE: { label: "Offline", tone: "neutral" },
  STARTING: { label: "Starting", tone: "warning", pulse: true },
  RUNNING: { label: "Running", tone: "success" },
  STOPPING: { label: "Stopping", tone: "warning", pulse: true },
  ERROR: { label: "Error", tone: "danger" },
  RESTORING: { label: "Restoring backup", tone: "info", pulse: true },
};

export function stateMeta(state: ServerState) {
  return META[state] ?? META.OFFLINE;
}

export function runtimeToState(state: ServerRuntimeState): ServerState {
  switch (state) {
    case "running":
      return "RUNNING";
    case "starting":
      return "STARTING";
    case "stopping":
      return "STOPPING";
    default:
      return "OFFLINE";
  }
}
