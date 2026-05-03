import { getCurrentRestaurant } from "@/lib/restaurant";
import { LoginForm } from "./login-form";

export default async function AdminLoginPage() {
  const restaurant = await getCurrentRestaurant();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="flex justify-center mb-3">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="7" fill="#c41230"/>
              <path d="M 4 19 A 12 10 0 0 1 28 19" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="10" y1="5.5" x2="22" y2="5.5" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="16" y1="5.5" x2="16" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <rect x="3" y="20.5" width="26" height="5.5" rx="2.75" fill="white"/>
            </svg>
          </div>
          <h1 className="text-[20px] font-semibold text-ink">
            {restaurant?.name ?? "LunchPad"} Admin
          </h1>
          <p className="text-[12px] text-slate-500 mt-1">Sign in to manage your restaurant</p>
        </div>
        <div className="rounded-[20px] border border-slate-100 bg-white p-6">
          <LoginForm restaurantId={restaurant?.id ?? ""} />
        </div>
      </div>
    </div>
  );
}
