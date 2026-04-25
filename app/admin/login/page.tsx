import { LoginForm } from "./login-form";

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-brand-700 mb-1">Local Bigger Burger</p>
          <h1 className="text-[20px] font-semibold text-ink">Admin sign in</h1>
          <p className="text-[12px] text-slate-500 mt-1">Medina Academy hot lunch operations</p>
        </div>
        <div className="rounded-[20px] border border-slate-100 bg-white p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
