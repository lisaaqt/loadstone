import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if ((await db.user.count()) === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <>
      <div className="mb-7 text-center lg:text-left">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted">Sign in to manage your Minecraft infrastructure.</p>
      </div>
      <LoginForm next={safeNext} />
    </>
  );
}
