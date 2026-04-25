import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { sendOrderConfirmationEmail } from "@/lib/email/service";
import { markOrderPaidByCheckoutSession } from "@/lib/orders";
import { stripe } from "@/lib/payments/stripe";
import { formatCurrency, formatList } from "@/lib/utils";
import { markWeeklyBatchPaidByCheckoutSession } from "@/lib/weekly-checkout";
import { OrderStatus } from "@prisma/client";
import { SiteHeader } from "@/components/site-header";
import { AppNav } from "@/components/app-nav";

export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ order?: string; batch?: string; session_id?: string }> }) {
  const params = await searchParams;

  let order = params.order ? await prisma.order.findUnique({ where: { id: params.order }, include: { student: true, deliveryDate: true, school: true, items: true, payment: true } }) : null;
  let batch = params.batch ? await prisma.weeklyCheckoutBatch.findUnique({ where: { id: params.batch }, include: { items: { include: { parentChild: true, deliveryDate: { include: { school: true } } } } } }) : null;

  if (order && order.status !== OrderStatus.PAID && params.session_id && stripe) {
    try {
      const session = await stripe.checkout.sessions.retrieve(params.session_id);
      if (session.payment_status === "paid") {
        order = await markOrderPaidByCheckoutSession(session.id, typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id, session.amount_total ?? null);
        if (!order.confirmationSentAt) { try { await sendOrderConfirmationEmail(order.id); } catch {} }
      }
    } catch {}
  }

  if (batch && batch.status !== "PAID" && params.session_id && stripe) {
    try {
      const session = await stripe.checkout.sessions.retrieve(params.session_id);
      if (session.payment_status === "paid") {
        const result = await markWeeklyBatchPaidByCheckoutSession(session.id, typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id, session.amount_total ?? null);
        batch = result.batch;
        for (const orderId of result.createdOrderIds) { try { await sendOrderConfirmationEmail(orderId); } catch {} }
      }
    } catch {}
  }

  return (
    <>
      <SiteHeader />
      <main className="app-content p-4">
        <div className="pt-8 text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center text-2xl mx-auto mb-3">✓</div>
          <h1 className="text-[20px] font-semibold text-ink mb-1">Order confirmed!</h1>
          <p className="text-[12px] text-slate-500">Confirmation email sent automatically.</p>
        </div>

        <div className="rounded-[18px] border border-slate-100 bg-white divide-y divide-slate-50 mb-4">
          {order ? (
            <>
              <div className="p-4"><p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Order</p><p className="text-[13px] font-semibold text-ink">{order.orderNumber}</p><p className="text-[12px] text-slate-500">{order.student.studentName} · {order.items.map((i) => i.itemNameSnapshot).join(", ")}</p></div>
              <div className="p-4 flex justify-between"><span className="text-[13px] text-slate-600">Total paid</span><span className="text-[15px] font-semibold text-ink">{formatCurrency(order.totalCents)}</span></div>
            </>
          ) : batch ? (
            <>
              <div className="p-4"><p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Weekly plan</p><p className="text-[13px] font-semibold text-ink">{batch.items.length} lunches booked</p></div>
              {batch.items.map((item) => (
                <div key={item.id} className="px-4 py-2.5 flex justify-between">
                  <div><p className="text-[12px] font-medium text-ink">{item.parentChild.studentName}</p><p className="text-[11px] text-slate-500">{item.itemNameSnapshot} · {formatInTimeZone(item.deliveryDate.deliveryDate, item.deliveryDate.school.timezone, "EEE, MMM d")}</p></div>
                  <p className="text-[12px] font-semibold text-ink">{formatCurrency(item.lineTotalCents)}</p>
                </div>
              ))}
              <div className="p-4 flex justify-between"><span className="text-[13px] text-slate-600">Total paid</span><span className="text-[15px] font-semibold text-ink">{formatCurrency(batch.totalCents)}</span></div>
            </>
          ) : (
            <div className="p-4"><p className="text-[12px] text-slate-500">Your payment succeeded. The order will appear once the webhook completes.</p></div>
          )}
        </div>

        <div className="space-y-2">
          <Link href="/order" className="flex w-full items-center justify-center rounded-xl bg-brand-700 py-3 text-[13px] font-semibold text-white no-underline">Order another day</Link>
          <Link href="/account" className="flex w-full items-center justify-center rounded-xl border border-slate-200 py-3 text-[13px] font-semibold text-ink no-underline">View my account</Link>
        </div>
      </main>
      <AppNav />
    </>
  );
}
