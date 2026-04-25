import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { updateOrderBeforeCutoff } from "@/lib/orders";
import { formatInTimeZone } from "date-fns-tz";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusStyle: Record<string, string> = {
  PAID: "bg-brand-100 text-brand-800",
  PENDING: "bg-amber-100 text-amber-800",
  REFUNDED: "bg-red-100 text-red-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      school: true,
      deliveryDate: true,
      student: true,
      items: { include: { menuItem: { include: { options: { orderBy: { sortOrder: "asc" } } } } } }
    }
  });

  if (!order) notFound();
  const item = order.items[0];

  async function saveOrder(formData: FormData) {
    "use server";
    await updateOrderBeforeCutoff({
      orderId,
      teacherName: String(formData.get("teacherName") || ""),
      classroom: String(formData.get("classroom") || ""),
      additions: formData.getAll("additions").map(String),
      removals: formData.getAll("removals").map(String),
      allergyNotes: String(formData.get("allergyNotes") || ""),
      specialInstructions: String(formData.get("specialInstructions") || "")
    });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    redirect("/admin/orders");
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/admin/orders" className="text-[12px] text-slate-500 no-underline flex items-center gap-1 hover:text-ink">
          ← Orders
        </Link>
        <span className="text-slate-200">/</span>
        <span className="text-[12px] text-slate-500">{order.orderNumber}</span>
      </div>

      <h1 className="text-[17px] font-semibold text-ink">Edit order</h1>

      {/* Order summary card */}
      <div className="rounded-[14px] border border-slate-100 bg-white divide-y divide-slate-50 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-ink">{order.student.studentName}</p>
            <p className="text-[11px] text-slate-500">Grade {order.student.grade} &middot; {order.school.name}</p>
          </div>
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${statusStyle[order.status] ?? "bg-slate-100 text-slate-600"}`}>
            {order.status}
          </span>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-500">Delivery</p>
            <p className="text-[13px] font-medium text-ink">
              {formatInTimeZone(order.deliveryDate.deliveryDate, order.school.timezone, "EEEE, MMMM d")}
            </p>
          </div>
          <p className="text-[16px] font-semibold text-ink">{formatCurrency(order.totalCents)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-slate-500 mb-1">Parent</p>
          <p className="text-[13px] text-ink">{order.parentName}</p>
          <p className="text-[11px] text-slate-500">{order.parentEmail}</p>
        </div>
      </div>

      {/* Edit form */}
      <form action={saveOrder} className="space-y-3">
        <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-[13px] font-semibold text-ink">Order details</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Changes are available until the delivery cutoff time.</p>
          </div>

          <div className="px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Teacher</label>
                <input name="teacherName" defaultValue={order.student.teacherName ?? ""}
                  className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Classroom</label>
                <input name="classroom" defaultValue={order.student.classroom ?? ""}
                  className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
              </div>
            </div>

            {item && (
              <>
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-ink">{item.itemNameSnapshot}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {[
                      item.additions.length ? `Add: ${item.additions.join(", ")}` : "",
                      item.removals.length ? `No: ${item.removals.join(", ")}` : ""
                    ].filter(Boolean).join(" · ") || "No customizations"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 mb-2">Add-ons</p>
                    <div className="space-y-1.5">
                      {item.menuItem.options.filter((o) => o.optionType === "ADD_ON").map((o) => (
                        <label key={o.id} className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
                          <input type="checkbox" name="additions" value={o.name}
                            defaultChecked={item.additions.includes(o.name)} className="rounded" />
                          {o.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 mb-2">Removals</p>
                    <div className="space-y-1.5">
                      {item.menuItem.options.filter((o) => o.optionType === "REMOVAL").map((o) => (
                        <label key={o.id} className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
                          <input type="checkbox" name="removals" value={o.name}
                            defaultChecked={item.removals.includes(o.name)} className="rounded" />
                          {o.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Allergy notes</label>
              <textarea name="allergyNotes" rows={2} defaultValue={item?.allergyNotes ?? ""}
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2 resize-none" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Special instructions</label>
              <textarea name="specialInstructions" rows={2} defaultValue={order.specialInstructions ?? ""}
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2 resize-none" />
            </div>
          </div>
        </div>

        <button type="submit" className="w-full py-3 rounded-xl bg-brand-700 text-white text-[13px] font-semibold">
          Save changes
        </button>
      </form>
    </div>
  );
}
