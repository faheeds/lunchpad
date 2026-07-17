"use client";

import { useState } from "react";
import { BELLEVUE_GRADES, REDMOND_GRADES } from "@/lib/grades";
import { getLabels } from "@/lib/location-labels";
import type { LocationType } from "@prisma/client";

function gradesForSchoolName(name: string): string[] {
  const n = name.toLowerCase();
  if (n.includes("bellevue")) return BELLEVUE_GRADES;
  if (n.includes("redmond"))  return REDMOND_GRADES;
  return [...BELLEVUE_GRADES, ...REDMOND_GRADES];
}

/** Used in server-form contexts (add/edit child on account page).
 *  Watches a sibling <select name="schoolId"> via controlled state so
 *  grade options update when the school changes. */
export function GradeSelect({
  schools,
  defaultSchoolId,
  defaultGrade,
}: {
  schools: { id: string; name: string; locationType?: LocationType }[];
  defaultSchoolId?: string;
  defaultGrade?: string;
}) {
  const [schoolId, setSchoolId] = useState(defaultSchoolId ?? schools[0]?.id ?? "");
  const selectedSchool = schools.find((s) => s.id === schoolId);
  const schoolName = selectedSchool?.name ?? "";
  const locationType = selectedSchool?.locationType ?? "SCHOOL";
  const labels = getLabels(locationType);
  const grades = gradesForSchoolName(schoolName);
  const isSchool = locationType === "SCHOOL";

  return (
    <>
      <select
        name="schoolId"
        value={schoolId}
        onChange={(e) => setSchoolId(e.target.value)}
        className="w-full rounded-xl border-slate-200 text-[13px]"
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
          className="w-full rounded-xl border-slate-200 text-[13px]"
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
          className="w-full rounded-xl border-slate-200 text-[13px]"
          style={{ borderRadius: 12, border: "1px solid #E3DBC6", fontSize: 14, padding: "8px 12px" }}
          required
        />
      )}
    </>
  );
}
