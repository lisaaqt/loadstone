import { Archive, Boxes, Terminal, Zap } from "lucide-react";
import { LogoMark } from "@/components/logo";

const FEATURES = [
  { icon: Zap, title: "Deploy in seconds", text: "Paper, Fabric, Forge, Velocity and more, on any Docker host." },
  { icon: Terminal, title: "Live console", text: "Stream logs and run commands from anywhere, in real time." },
  { icon: Archive, title: "Effortless backups", text: "Scheduled snapshots to local disk or S3-compatible storage." },
  { icon: Boxes, title: "Multi-node", text: "Spread your servers across as many machines as you need." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(ellipse_at_30%_20%,black_10%,transparent_70%)]" />
        <div className="pointer-events-none absolute -left-32 -top-32 size-[560px] rounded-full bg-primary/[0.18] blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 right-0 size-[440px] rounded-full bg-info/[0.12] blur-[120px]" />

        <div className="relative flex items-center gap-3">
          <LogoMark className="size-9" />
          <span className="text-[15px] font-semibold tracking-tight">Loadstone</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[40px] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground">
            Minecraft infrastructure, <span className="text-brand-gradient">beautifully managed.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-muted">
            A self-hosted control plane for your servers, nodes, worlds and backups. It's fast, secure and pleasant to use.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="surface rounded-xl p-4">
                <span className="icon-tile size-8 rounded-lg text-primary dark:text-primary-strong">
                  <f.icon className="size-4" />
                </span>
                <div className="mt-3 text-[13px] font-semibold">{f.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted">{f.text}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-subtle">Self-hosted · Open infrastructure · Your data stays yours</p>
      </aside>

      <main className="relative flex items-center justify-center px-5 py-12">
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_60%)] lg:hidden" />
        <div className="relative w-full max-w-[380px] animate-slide-up">
          <div className="mb-8 flex justify-center lg:hidden">
            <LogoMark className="size-10" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
