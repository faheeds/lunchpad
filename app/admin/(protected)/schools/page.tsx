import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ALLOWED_SCHOOL_SLUGS } from "@/lib/school-config";
import { schoolSchema } from "@/lib/validation/order";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function createSchool(formData: FormData) {
  "use server";
  const parsed = schoolSchema.parse({
    name: formData.get("name"),
    slug: slugify(String(formData.get("name") || "")),
    timezone: formData.get("timezone"),
    defaultCutoffHour: formData.get("defaultCutoffHour"),
    defaultCutoffMinute: formData.get("defaultCutoffMinute"),
    collectTeacher: formData.get("collectTeacher") === "on",
    collectClassroom: formData.get("collectClassroom") === "on",
    isActive: formData.get("isActive") === "on"
  });
  await prisma.school.create({ data: parsed });
  revalidatePath("/admin/schools");
}

async function toggleSchool(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const current = await prisma.school.findUnique({ where: { id }, select: { isActive: true } });
  await prisma.school.update({ where: { id }, data: { isActive: !current?.isActive } });
  revalidatePath("/admin/schools");
}

export default async function AdminSchoolsPage() {
  const schools = await prisma.school.findMany({
    where: { slug: { in: [...ALLOWED_SCHOOL_SLUGS] } },
    orderBy: { name: "asc" }
  });

  return (
    <div className="space-y-4 pb-10">
      <h1 className="text-[17px] font-semibold text-ink">Schools</h1>

      {/* Add school */}
      <details className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <span className="text-[13px] font-semibold text-ink">+ Add school</span>
          <span className="text-[11px] text-slate-400">tap to expand</span>
        </summary>
        <form action={createSchool} className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">School name</label>
              <input name="name" placeholder="e.g. Medina Academy Redmond" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Timezone</label>
              <input name="timezone" defaultValue="America/Los_Angeles" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Cutoff hour (24h)</label>
              <input name="defaultCutoffHour" defaultValue="21" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Cutoff minute</label>
              <input name="defaultCutoffMinute" defaultValue="0" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
          </div>
          <div className="flex gap-4 flex-wrap pt-1">
            <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
              <input type="checkbox" name="collectTeacher" defaultChecked className="rounded" /> Collect teacher
            </label>
            <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
              <input type="checkbox" name="collectClassroom" defaultChecked className="rounded" /> Collect classroom
            </label>
            <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
              <input type="checkbox" name="isActive" defaultChecked className="rounded" /> Active
            </label>
          </div>
          <button type="submit" className="w-full py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
            Add school
          </button>
        </form>
      </details>

      {/* School list */}
      <div className="space-y-2">
        {schools.map((school) => (
          <div key={school.id} className="rounded-[14px] border border-slate-100 bg-white px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold text-ink truncate">{school.name}</p>
                {!school.isActive && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0">Inactive</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{school.timezone}</p>
              <p className="text-[11px] text-slate-400">
                Cutoff {school.defaultCutoffHour}:{String(school.defaultCutoffMinute).padStart(2, "0")} &middot;
                {school.collectTeacher ? " Teacher" : ""}{school.collectClassroom ? " · Classroom" : ""}
              </p>
            </div>
            <form action={toggleSchool}>
              <input type="hidden" name="id" value={school.id} />
              <button type="submit"
                className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition flex-shrink-0 ${
                  school.isActive
                    ? "border-slate-200 text-slate-600 hover:border-red-200 hover:text-red-700"
                    : "border-brand-200 text-brand-700 hover:bg-brand-50"
                }`}>
                {school.isActive ? "Deactivate" : "Activate"}
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
