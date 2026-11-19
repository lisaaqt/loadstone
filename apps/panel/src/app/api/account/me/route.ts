import { handler } from "@/lib/api";

export const GET = handler(async ({ user }) => ({ user }));
