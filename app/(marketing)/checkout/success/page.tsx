import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { sendOrderConfirmationEmail } from "@/lib/email/service";
import { markOrderPaidByCheckoutSession } from "@/lib/orders";
import { stripe } from "@/lib/payments/stripe";
import { formatCurrency } from "@/lib/utils";
import { markWeeklyBatchPaidByCheckoutSession } from "@/lib/weekly-checkout";
import { OrderStatus } from "@prisma/client";
import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";
import { OrderSelfService } from "@/components/order/order-self-service";

export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; batch?: string; session_id?: string }>;
}) {
  const params = await searchParams;

  let order = params.order
    ? await prisma.order.findUnique({
        where: { id: params.order },
        include: { student: true, deliveryDate: true, school: true, items: true, payment: true, restaurant: true },
      })
    : null;

  let batch = params.batch
    ? await prisma.weeklyCheckoutBatch.findUnique({
        where: { id: params.batch },
        include: {
          items: {
            include: {
              parentChild: true,
              deliveryDate: { include: { school: true } },
            },
            orderBy: { deliveryDate: { deliveryDate: "asc" } },
          },
        },
      })
    : null;

  // Mark paid if webhook hasn't fired yet (fallback reconciliation)
  if (order && order.status !== OrderStatus.PAID && params.session_id && stripe) {
    try {
      const session = await stripe.checkout.sessions.retrieve(params.session_id);
      if (session.payment_status === "paid") {
        const marked = await markOrderPaidByCheckoutSession(
          session.id,
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
          session.amount_total ?? null
        );
        if (!marked.confirmationSentAt) {
          try { await sendOrderConfirmationEmail(marked.id, marked.restaurantId); } catch {}
        }
        // Re-fetch with the same `include` shape so the rest of the page
        // (which expects `order.restaurant`) keeps working.
        order = await prisma.order.findUnique({
          where: { id: marked.id },
          include: { student: true, deliveryDate: true, school: true, items: true, payment: true, restaurant: true },
        });
      }
    } catch {}
  }

  if (batch && batch.status !== "PAID" && params.session_id && stripe) {
    try {
      const session = await stripe.checkout.sessions.retrieve(params.session_id);
      if (session.payment_status === "paid") {
        const result = await markWeeklyBatchPaidByCheckoutSession(
          session.id,
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
          session.amount_total ?? null
        );
        batch = result.batch;
        // All orders in a weekly batch belong to the same restaurant
        if (result.createdOrderIds.length > 0) {
          const sample = await prisma.order.findUnique({
            where: { id: result.createdOrderIds[0] },
            select: { restaurantId: true },
          });
          if (sample) {
            for (const orderId of result.createdOrderIds) {
              try { await sendOrderConfirmationEmail(orderId, sample.restaurantId); } catch {}
            }
          }
        }
      }
    } catch {}
  }

  const isWeekly = !!batch && !order;

  return (
    <>
      <SiteHeaderServer />
      <main className="app-content pb-24">
        <div className="px-4 pt-8 pb-4">

          {/* ── Success header ─────────────────────────────────────── */}
          <div className="text-center mb-6">
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 12px",
              boxShadow: "0 4px 16px rgba(22,163,74,0.3)",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--dark-bg)", marginBottom: 4, letterSpacing: "-0.02em" }}>
              {isWeekly ? "Week booked!" : "Order confirmed!"}
            </h1>
            <p style={{ fontSize: 12, color: "#94a3b8" }}>
              A confirmation email has been sent to you.
            </p>
          </div>

          {/* ── Single order receipt ───────────────────────────────── */}
          {order && (
            <div style={{
              background: "white", borderRadius: 20,
              border: "1px solid #f1f5f9",
              overflow: "hidden", marginBottom: 12,
            }}>
              {/* Order number header */}
              <div style={{
                background: "linear-gradient(135deg, var(--dark-bg, #0f1923) 0%, #1a2d42 100%)",
                padding: "14px 18px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 2 }}>
                    Order
                  </p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "white", letterSpacing: "0.02em" }}>
                    {order.orderNumber}
                  </p>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: "#bbf7d0", color: "#15803d",
                  borderRadius: 100, padding: "4px 10px",
                }}>
                  Confirmed
                </span>
              </div>

              {/* Delivery row */}
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #f8fafc", display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{
                  flexShrink: 0, width: 40, height: 40, borderRadius: 10,
                  background: "#fff1f3",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                }}>
                  <p style={{ fontSize: 7, fontWeight: 700, color: "#c41230", textTransform: "uppercase" }}>
                    {formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "MMM")}
                  </p>
                  <p style={{ fontSize: 17, fontWeight: 800, color: "#c41230", lineHeight: 1 }}>
                    {formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "d")}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dark-bg)" }}>
                    {formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "EEEE, MMMM d")}
                  </p>
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                    {order.school.name}
                  </p>
                </div>
              </div>

              {/* Student row */}
              <div style={{ padding: "12px 18px", borderBottom: "1px solid #f8fafc" }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Student</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark-bg)" }}>
                  {order.student.studentName}
                  {order.student.grade && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8" }}> · Grade {order.student.grade}</span>
                  )}
                </p>
                {(order.student.teacherName || order.student.classroom) && (
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                    {[order.student.teacherName, order.student.classroom].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>

              {/* Items */}
              {order.items.map((item) => {
                const customizations = [
                  item.additions.length ? `+ ${item.additions.join(", ")}` : "",
                  item.removals.length ? `No ${item.removals.join(", ")}` : "",
                ].filter(Boolean);

                return (
                  <div key={item.id} style={{ padding: "12px 18px", borderBottom: "1px solid #f8fafc", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark-bg)" }}>{item.itemNameSnapshot}</p>
                      {customizations.length > 0 && (
                        <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{customizations.join(" · ")}</p>
                      )}
                      {item.allergyNotes && (
                        <span style={{
                          display: "inline-block", marginTop: 4,
                          fontSize: 10, fontWeight: 700,
                          color: "#b91c1c", background: "#fee2e2",
                          borderRadius: 100, padding: "2px 8px",
                        }}>
                          ⚠ {item.allergyNotes}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark-bg)", flexShrink: 0 }}>
                      {formatCurrency(item.lineTotalCents)}
                    </p>
                  </div>
                );
              })}

              {/* Total */}
              <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#64748b" }}>Total paid</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "var(--dark-bg)", letterSpacing: "-0.02em" }}>
                  {formatCurrency(order.totalCents)}
                </span>
              </div>
            </div>
          )}

          {/* ── Weekly batch receipt ───────────────────────────────── */}
          {batch && (
            <div style={{
              background: "white", borderRadius: 20,
              border: "1px solid #f1f5f9",
              overflow: "hidden", marginBottom: 12,
            }}>
              {/* Header */}
              <div style={{
                background: "linear-gradient(135deg, var(--dark-bg, #0f1923) 0%, #1a2d42 100%)",
                padding: "14px 18px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 2 }}>
                    Weekly plan
                  </p>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "white" }}>
                    {batch.items.length} lunch{batch.items.length !== 1 ? "es" : ""} booked
                  </p>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: "#bbf7d0", color: "#15803d",
                  borderRadius: 100, padding: "4px 10px",
                }}>
                  Confirmed
                </span>
              </div>

              {/* Each day */}
              {batch.items.map((item) => (
                <div key={item.id} style={{
                  padding: "12px 18px",
                  borderBottom: "1px solid #f8fafc",
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
                }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
                    <div style={{
                      flexShrink: 0, width: 36, height: 36, borderRadius: 9,
                      background: "#fff1f3",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    }}>
                      <p style={{ fontSize: 6, fontWeight: 700, color: "#c41230", textTransform: "uppercase" }}>
                        {formatInTimeZone(item.deliveryDate.deliveryDate, item.deliveryDate.school.timezone, "MMM")}
                      </p>
                      <p style={{ fontSize: 15, fontWeight: 800, color: "#c41230", lineHeight: 1 }}>
                        {formatInTimeZone(item.deliveryDate.deliveryDate, item.deliveryDate.school.timezone, "d")}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--dark-bg)" }}>
                        {formatInTimeZone(item.deliveryDate.deliveryDate, item.deliveryDate.school.timezone, "EEEE")}
                      </p>
                      <p style={{ fontSize: 11, color: "#64748b" }}>
                        {item.parentChild.studentName} · {item.itemNameSnapshot}
                      </p>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dark-bg)", flexShrink: 0 }}>
                    {formatCurrency(item.lineTotalCents)}
                  </p>
                </div>
              ))}

              {/* Total */}
              <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#64748b" }}>Total paid</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "var(--dark-bg)", letterSpacing: "-0.02em" }}>
                  {formatCurrency(batch.totalCents)}
                </span>
              </div>
            </div>
          )}

          {/* Fallback: payment succeeded but webhook hasn't completed yet */}
          {!order && !batch && (
            <div style={{
              background: "white", borderRadius: 20, border: "1px solid #f1f5f9",
              padding: "20px 18px", marginBottom: 12, textAlign: "center",
            }}>
              <p style={{ fontSize: 13, color: "#94a3b8" }}>
                Payment received. Your order details will appear in order history shortly.
              </p>
            </div>
          )}

          {/* ── Self-service: cancel + contact restaurant ──────────── */}
          {order && (
            <OrderSelfService
              orderId={order.id}
              cutoffAt={order.deliveryDate.cutoffAt.toISOString()}
              restaurantName={order.restaurant.name}
              contactEmail={order.restaurant.contactEmail}
              contactPhone={order.restaurant.contactPhone}
            />
          )}

          {/* ── Action buttons ─────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <Link href="/history" style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 14, padding: "13px 0",
              background: "var(--brand-on-white, #c41230)",
              color: "white", fontSize: 14, fontWeight: 700,
              textDecoration: "none",
            }}>
              View order history
            </Link>
            <Link href="/order" style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 14, padding: "13px 0",
              border: "1px solid #e2e8f0",
              color: "var(--dark-bg)", fontSize: 13, fontWeight: 600,
              textDecoration: "none", background: "white",
            }}>
              Order another day
            </Link>
          </div>

        </div>
      </main>
      <AppNav />
    </>
  );
}
