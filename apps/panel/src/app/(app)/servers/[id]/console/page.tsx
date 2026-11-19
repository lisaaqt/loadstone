"use client";

import { Console } from "@/components/console/console";
import { useServer } from "@/components/servers/use-server";

export default function ConsolePage() {
  const server = useServer();
  return <Console serverId={server.id} running={server.state === "RUNNING" || server.state === "STARTING"} />;
}
