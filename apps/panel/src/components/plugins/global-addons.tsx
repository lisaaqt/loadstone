"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Package } from "lucide-react";
import { SOFTWARE, type SoftwareId } from "@loadstone/shared";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/layout";
import { AddonBrowser } from "./addon-browser";

interface EligibleServer {
  id: string;
  name: string;
  software: SoftwareId;
  mcVersion: string;
  installed: number;
}

export function GlobalAddons({ servers }: { servers: EligibleServer[] }) {
  const [serverId, setServerId] = useState(servers[0]?.id ?? "");
  const server = servers.find((s) => s.id === serverId);

  if (!servers.length) {
    return (
      <Card>
        <EmptyState icon={Package} title="No compatible servers" description="Create a Paper, Purpur, Fabric, Forge, NeoForge, Quilt, Folia or Velocity server to install addons." />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <span className="text-[13px] text-muted">Install to</span>
        <Select
          value={serverId}
          onValueChange={setServerId}
          className="w-72"
          options={servers.map((s) => ({
            value: s.id,
            label: s.name,
            description: `${SOFTWARE[s.software].label} ${SOFTWARE[s.software].usesMinecraftVersion ? s.mcVersion : ""} · ${s.installed} tracked`,
          }))}
        />
        {server && (
          <Button variant="ghost" size="sm" asChild className="ml-auto">
            <Link href={`/servers/${server.id}/plugins`}>
              Manage installed <ArrowUpRight />
            </Link>
          </Button>
        )}
      </Card>
      {server && (
        <Card className="overflow-hidden">
          <AddonBrowser key={server.id} serverId={server.id} software={server.software} mcVersion={server.mcVersion} />
        </Card>
      )}
    </div>
  );
}
