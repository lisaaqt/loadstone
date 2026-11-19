import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  return (
    <>
      <div className="mb-7 text-center lg:text-left">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">Welcome to Loadstone</h1>
        <p className="mt-1 text-[13px] text-muted">Create the administrator account to get started.</p>
      </div>
      <SetupForm />
    </>
  );
}
