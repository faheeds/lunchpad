import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { requireParent } from "@/lib/parent-auth";
import { SiteHeader } from "@/components/site-header";
import { AppNav } from "@/components/app-nav";
import Link from "next/link";

export const dynamic = "force-dynamic";

const statusStyle: Record<string, string> = {
  PAID: "bg-brand-100 text-brand-900",
  PENDING: "bg-amber-100 text-amber-900",
  REFUNDED: "bg-red-100 text-red-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export default async function HistoryPage() {
  const session = await requireParent();
  const parentUserId = session.user?.parentUserId;
  if (!parentUserId) redirect("/account/sign-in");

  const orders = await prisma.order.findMany({
    where: { parentUserId, archivedAt: null },
    include: { school: true, deliveryDate: true, student: true, items: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <>
      <SiteHeader />
      <main className="app-content pb-4">
        <div className="px-4 py-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand-700 mb-0.5">Orders</p>
          <h1 className="text-[20px] font-semibold text-ink mb-4">Order history</h1>

          {orders.length ? (
            <div className="space-y-2">
              {orders.map((order) => (
                <div key={order.id} className="rounded-[18px] border border-slate-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-ink">{order.student.studentName}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {order.items.map((i) => i.itemNameSnapshot).join(", ")}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {order.school.name} · {formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "EEE, MMM d")}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{order.orderNumber}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyle[order.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {order.status}
                      </span>
                      <p className="text-[14px] font-semibold text-ink mt-1">
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(order.totalCents / 100)}
                      </p>
                      <Link href={`/order?reorder=${order.id}`}
                        className="text-[11px] text-brand-700 font-medium mt-1 block no-underline">
                        Reorder →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-slate-100 bg-white px-4 py-8 text-center">
              <p className="text-[14px] text-slate-400">No orders yet.</p>
              <Link href="/order" className="mt-3 inline-block text-[13px] font-semibold text-brand-700 no-underline">
                Place your first order →
              </Link>
            </div>
          )}
        </div>
      </main>
      <AppNav />
    </>
  );
}
