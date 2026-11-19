import { handler } from "@/lib/api";
import { serverWithAgent } from "@/lib/access";
import { streamResponse } from "@/lib/proxy";

type Params = { id: string };

export const GET = handler<Params>(async ({ req, user, params }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const lines = Math.min(Number(req.nextUrl.searchParams.get("lines") ?? 5000) || 5000, 50_000);
  const upstream = await agent.raw(`${base}/logs`, { query: { lines }, timeoutMs: 60_000 });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return streamResponse(upstream, `${server.name.replace(/[^A-Za-z0-9_-]+/g, "-")}-${stamp}.log`, "text/plain; charset=utf-8");
});
