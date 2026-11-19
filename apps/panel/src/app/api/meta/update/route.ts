import { handler } from "@/lib/api";
import { updateStatus } from "@/lib/updates";

/** Panel version vs. the newest version tag in the image registry. `?refresh=1` checks again right away. */
export const GET = handler(
  async ({ req }) => updateStatus(req.nextUrl.searchParams.get("refresh") === "1"),
  { admin: true, rateLimit: { limit: 30, windowSeconds: 60, bucket: "update-check" } },
);
