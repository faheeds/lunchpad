"use client";

import { useState } from "react";
import { BELLEVUE_GRADES, REDMOND_GRADES } from "@/lib/grades";

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
  schools: { id: string; name: string }[];
  defaultSchoolId?: string;
  defaultGrade?: string;
}) {
  const [schoolId, setSchoolId] = useState(defaultSchoolId ?? schools[0]?.id ?? "");
  const schoolName = schools.find((s) => s.id === schoolId)?.name ?? "";
  const grades = gradesForSchoolName(schoolName);

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
    </>
  );
}
