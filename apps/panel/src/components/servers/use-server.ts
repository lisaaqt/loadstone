"use client";

import { createContext, useContext } from "react";
import useSWR from "swr";
import type { ServerSoftware, ServerState } from "@/generated/prisma/client";
import type { ServerStats } from "@loadstone/shared";

export interface ServerInfo {
  id: string;
  name: string;
  description: string | null;
  software: ServerSoftware;
  mcVersion: string;
  javaVersion: string;
  image: string;
  memoryMb: number;
  cpuPercent: number;
  diskMb: number;
  port: number;
  internalPort: number;
  state: ServerState;
  installError: string | null;
  address: string;
  nodeName: string;
  nodeId: string;
  ownerName: string;
  createdAt: string;
  canAdmin: boolean;
  /** Owner or admin: may manage members and reinstall. */
  canManage: boolean;
}

export const ServerContext = createContext<ServerInfo | null>(null);

export function useServer(): ServerInfo {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error("useServer must be used inside a server layout");
  return ctx;
}

export interface StatusResponse {
  state: ServerState;
  stats: ServerStats | null;
  error: string | null;
}

export function useServerStatus(id: string, initialState?: ServerState) {
  return useSWR<StatusResponse>(`/api/servers/${id}/status`, {
    refreshInterval: (data) => (data?.state === "INSTALLING" || data?.state === "RESTORING" || data?.state === "STARTING" || data?.state === "STOPPING" ? 2000 : 5000),
    fallbackData: initialState ? { state: initialState, stats: null, error: null } : undefined,
    revalidateOnMount: true,
  });
}
