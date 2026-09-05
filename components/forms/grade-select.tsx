"use client";

import { useState } from "react";
import { STANDARD_GRADES } from "@/lib/grades";
import { getLabels } from "@/lib/location-labels";
import type { LocationType } from "@prisma/client";

/** Used in server-form contexts (add/edit child on account page).
 *  Watches a sibling <select name="schoolId"> via controlled state so
 *  grade options update when the school changes. */
export function GradeSelect({
  schools,
  defaultSchoolId,
  defaultGrade,
}: {
  schools: { id: string; name: string; locationType?: LocationType; grades?: string[] }[];
  defaultSchoolId?: string;
  defaultGrade?: string;
}) {
  const [schoolId, setSchoolId] = useState(defaultSchoolId ?? schools[0]?.id ?? "");
  const selectedSchool = schools.find((s) => s.id === schoolId);
  const locationType = selectedSchool?.locationType ?? "SCHOOL";
  const labels = getLabels(locationType);
  // A school's own configured grades, or the generic K-12 fallback if it
  // hasn't set any yet.
  const grades = selectedSchool?.grades?.length ? selectedSchool.grades : STANDARD_GRADES;
  const isSchool = locationType === "SCHOOL";

  return (
    <>
      <select
        name="schoolId"
        value={schoolId}
        onChange={(e) => setSchoolId(e.target.value)}
        className="w-full rounded-xl border border-slate-200 text-[13px]"
        required
      >
        {schools.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {isSchool ? (
        <select
          name="grade"
          defaultValue={defaultGrade ?? ""}
          className="w-full rounded-xl border border-slate-200 text-[13px]"
          required
        >
          <option value="" disabled>Select grade</option>
          {grades.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      ) : (
        <input
          name="grade"
          type="text"
          defaultValue={defaultGrade ?? ""}
          placeholder={labels.gradePlaceholder}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          required
        />
      )}
    </>
  );
}
