import { cn } from "@/lib/utils";

export function AppHeader({ children }: { children: React.ReactNode }) {
  return <header className="app-header">{children}</header>;
}

export function AppContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cn("app-content", className)}>{children}</main>;
}

export function Pad({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-4 py-4", className)}>{children}</div>;
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[18px] border border-slate-100 bg-white p-4 shadow-card", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-700 mb-0.5">
      {children}
    </p>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-xl font-semibold text-ink mb-1">{children}</h1>;
}

export function PageSub({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-slate-500 leading-relaxed mb-4">{children}</p>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-slate-100 my-3", className)} />;
}

export function Badge({ children, variant = "gray" }: { children: React.ReactNode; variant?: "green" | "amber" | "red" | "gray" | "blue" }) {
  const styles = {
    green: "bg-brand-100 text-brand-900",
    amber: "bg-amber-100 text-amber-900",
    red:   "bg-red-100 text-red-800",
    gray:  "bg-slate-100 text-slate-600",
    blue:  "bg-blue-100 text-blue-800",
  };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold", styles[variant])}>
      {children}
    </span>
  );
}

export function Btn({
  children, onClick, type = "button", disabled, variant = "ink", className, fullWidth = true
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  variant?: "ink" | "green" | "outline" | "danger";
  className?: string;
  fullWidth?: boolean;
}) {
  const styles = {
    ink:     "bg-ink text-white hover:opacity-85",
    green:   "bg-brand-700 text-white hover:opacity-85",
    outline: "bg-transparent border border-slate-200 text-ink hover:bg-slate-50",
    danger:  "bg-transparent border border-red-200 text-red-800 hover:bg-red-50",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-4 py-3 rounded-xl text-[13px] font-semibold transition disabled:opacity-30 disabled:cursor-default",
        fullWidth ? "w-full" : "",
        styles[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Notice({ children, variant = "amber" }: { children: React.ReactNode; variant?: "amber" | "green" | "red" }) {
  const styles = {
    amber: "bg-amber-50 text-amber-900",
    green: "bg-brand-50 text-brand-900",
    red:   "bg-red-50 text-red-800",
  };
  return (
    <div className={cn("rounded-xl px-3 py-2.5 text-[12px] leading-relaxed flex gap-2 items-start", styles[variant])}>
      {children}
    </div>
  );
}

export function BnavItem({
  label, icon, active, onClick
}: {
  label: string; icon: string; active?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-0.5 py-1 cursor-pointer border-none bg-transparent"
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className={cn("text-[9px]", active ? "text-brand-700 font-semibold" : "text-slate-400")}>
        {label}
      </span>
    </button>
  );
}

// Legacy compat exports
export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("container-app py-6 sm:py-8", className)}>{children}</div>;
}

export function SectionTitle({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="space-y-1 mb-4">
      {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-700">{eyebrow}</p>}
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      {description && <p className="text-sm text-slate-500">{description}</p>}
    </div>
  );
}
