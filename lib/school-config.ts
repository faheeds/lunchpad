import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * Returns active school slugs for the given restaurant.
 * Used to validate school selection in order forms.
 * Cached per request.
 */
export const getActiveSchoolSlugs = cache(async (restaurantId: string): Promise<string[]> => {
  const schools = await prisma.school.findMany({
    where: { restaurantId, isActive: true },
    select: { slug: true },
  });
  return schools.map((s) => s.slug);
});

/**
 * Returns active schools (id + name + slug) for a restaurant.
 * Used to populate the school selector in the order form.
 */
export const getActiveSchools = cache(async (restaurantId: string) => {
  return prisma.school.findMany({
    where: { restaurantId, isActive: true },
    select: { id: true, name: true, slug: true, timezone: true,
              collectTeacher: true, collectClassroom: true },
    orderBy: { name: "asc" },
  });
});
