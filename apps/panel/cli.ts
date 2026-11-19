import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { probeNode } from "@/lib/nodes";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
env();

const nodeSchema = z.object({
  NODE_NAME: z.string().trim().min(1).max(48),
  NODE_HOST: z.string().trim().min(1),
  NODE_PORT: z.coerce.number().int().default(8080),
  NODE_SCHEME: z.enum(["http", "https"]).default("http"),
  NODE_PUBLIC_HOST: z.string().trim().min(1),
  NODE_TOKEN: z.string().min(32),
  NODE_MEMORY_MB: z.coerce.number().int().min(512),
  NODE_DISK_MB: z.coerce.number().int().min(1024),
  NODE_PORT_START: z.coerce.number().int().default(25565),
  NODE_PORT_END: z.coerce.number().int().default(25665),
});

async function ensureNode() {
  const cfg = nodeSchema.parse(process.env);
  const connection = {
    scheme: cfg.NODE_SCHEME,
    host: cfg.NODE_HOST,
    port: cfg.NODE_PORT,
    publicHost: cfg.NODE_PUBLIC_HOST,
    tokenEncrypted: encrypt(cfg.NODE_TOKEN),
  };
  const existing = await db.node.findUnique({ where: { name: cfg.NODE_NAME } });
  if (existing) {
    await db.node.update({ where: { id: existing.id }, data: { ...connection, status: "UNKNOWN" } });
    console.log(`Updated connection of node "${cfg.NODE_NAME}" (${existing.id}), allocations unchanged`);
  } else {
    const node = await db.node.create({
      data: {
        name: cfg.NODE_NAME,
        description: "Provisioned by update.sh",
        ...connection,
        memoryMb: cfg.NODE_MEMORY_MB,
        diskMb: cfg.NODE_DISK_MB,
        portRangeStart: cfg.NODE_PORT_START,
        portRangeEnd: cfg.NODE_PORT_END,
      },
    });
    console.log(`Registered node "${cfg.NODE_NAME}" (${node.id})`);
  }
}

async function probe() {
  const name = nodeSchema.shape.NODE_NAME.parse(process.env.NODE_NAME);
  const node = await db.node.findUnique({ where: { name } });
  if (!node) throw new Error(`Node "${name}" is not registered`);
  let lastError = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 3000));
    const result = await probeNode(node);
    if (result.ok) {
      console.log(`Node "${name}" is online (agent ${result.info.agentVersion}, ${result.info.cpuCount} CPUs)`);
      return;
    }
    lastError = result.error;
  }
  throw new Error(`Node "${name}" is not reachable: ${lastError}`);
}

const commands: Record<string, () => Promise<void>> = { "ensure-node": ensureNode, "probe-node": probe };

const command = process.argv[2] ?? "";
const run = commands[command];
if (!run) {
  console.error(`Usage: node dist/cli.js <${Object.keys(commands).join("|")}>`);
  process.exit(2);
}

run()
  .then(() => db.$disconnect())
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await db.$disconnect();
    process.exit(1);
  });
