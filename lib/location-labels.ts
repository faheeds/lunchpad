/**
 * Single source of truth for school-vs-office terminology.
 *
 * Every admin/parent-facing label that differs between SCHOOL and OFFICE
 * locations should pull from getLabels(location.locationType) — never
 * hard-code "student", "classroom", "parent", etc.
 *
 * The DB columns retain their school-era names (Student.studentName,
 * Student.classroom, Student.teacherName, etc.) — only display labels
 * swap. This avoids a destructive migration on a live tenant.
 */

import type { LocationType } from "@prisma/client";

export type LocationLabels = {
  /** Capitalized noun for the type itself, e.g. "School" / "Office". */
  type: string;
  /** Plural of `type`, e.g. "Schools" / "Offices". */
  typePlural: string;
  /** Generic "place" noun, e.g. "Location" — same for both, but lives here for completeness. */
  location: string;
  locationPlural: string;
  /** The person being fed, e.g. "Student" / "Employee". */
  unit: string;
  unitPlural: string;
  /** "Student name" / "Employee name" — full form for form fields. */
  unitName: string;
  /** Sub-grouping inside a location, e.g. "Classroom" / "Team". */
  group: string;
  groupPlural: string;
  /** Used as a placeholder in inputs. */
  groupPlaceholder: string;
  /** Higher-level grouping (used as the "grade" concept on schools). */
  grade: string;
  gradePlaceholder: string;
  /** Whether to show the grade field at all on this type. */
  showGrade: boolean;
  /** Person responsible for the unit on-site, e.g. "Teacher" / "Manager". */
  supervisor: string;
  supervisorPlaceholder: string;
  /** Whether to show the supervisor field. */
  showSupervisor: boolean;
  /** The user placing the order, e.g. "Parent" / "Ordering user". */
  orderer: string;
  ordererPlural: string;
  /** Possessive — "parent's" / "your". */
  ordererPossessive: string;
  /** "your child" / "yourself" — for parent-facing copy where the orderer talks about the unit. */
  ordererRefersToUnit: string;
};

const SCHOOL_LABELS: LocationLabels = {
  type: "School",
  typePlural: "Schools",
  location: "Location",
  locationPlural: "Locations",
  unit: "Student",
  unitPlural: "Students",
  unitName: "Student name",
  group: "Classroom",
  groupPlural: "Classrooms",
  groupPlaceholder: "Room 12",
  grade: "Grade",
  gradePlaceholder: "5th",
  showGrade: true,
  supervisor: "Teacher",
  supervisorPlaceholder: "Mrs. Smith",
  showSupervisor: true,
  orderer: "Parent",
  ordererPlural: "Parents",
  ordererPossessive: "parent's",
  ordererRefersToUnit: "your child",
};

const OFFICE_LABELS: LocationLabels = {
  type: "Office",
  typePlural: "Offices",
  location: "Location",
  locationPlural: "Locations",
  unit: "Employee",
  unitPlural: "Employees",
  unitName: "Employee name",
  group: "Team",
  groupPlural: "Teams",
  groupPlaceholder: "Engineering",
  grade: "Title",
  gradePlaceholder: "Senior Engineer",
  showGrade: false,
  supervisor: "Manager",
  supervisorPlaceholder: "Alex Lee",
  showSupervisor: false,
  orderer: "Ordering user",
  ordererPlural: "Ordering users",
  ordererPossessive: "your",
  ordererRefersToUnit: "yourself",
};

/**
 * Returns the canonical label set for a location type.
 * Falls back to school labels if type is null/undefined (legacy rows).
 */
export function getLabels(type: LocationType | null | undefined): LocationLabels {
  return type === "OFFICE" ? OFFICE_LABELS : SCHOOL_LABELS;
}

/**
 * Operator-level (restaurant-wide) version: returns labels based on
 * Restaurant.operatorType ("school" | "office" | "hybrid" | null). Used
 * by customer-facing pages that need to decide global copy before any
 * particular location is in scope (homepage, signup, navigation).
 *
 * - "school"  → school labels
 * - "office"  → office labels
 * - "hybrid"  → neutral / mixed labels
 * - null/""   → school labels (legacy default)
 */
export function getLabelsForOperator(operatorType: string | null | undefined): LocationLabels {
  const t = (operatorType ?? "").toLowerCase();
  if (t === "office") return OFFICE_LABELS;
  if (t === "hybrid") return getMergedLabels(["SCHOOL", "OFFICE"]);
  return SCHOOL_LABELS;
}

/**
 * For UIs that span multiple location types (e.g. all-locations dashboard),
 * returns a "merged" label set that uses the most general terms.
 * If all locations are the same type, returns that type's labels exactly.
 */
export function getMergedLabels(types: ReadonlyArray<LocationType>): LocationLabels {
  if (types.length === 0) return SCHOOL_LABELS;
  const allSchool = types.every((t) => t === "SCHOOL");
  const allOffice = types.every((t) => t === "OFFICE");
  if (allSchool) return SCHOOL_LABELS;
  if (allOffice) return OFFICE_LABELS;
  // Mixed — use generic neutral language.
  return {
    ...SCHOOL_LABELS,
    type: "Location",
    typePlural: "Locations",
    unit: "Diner",
    unitPlural: "Diners",
    unitName: "Diner name",
    group: "Group",
    groupPlural: "Groups",
    groupPlaceholder: "Group",
    grade: "Tier",
    gradePlaceholder: "",
    showGrade: false,
    supervisor: "Contact",
    supervisorPlaceholder: "",
    showSupervisor: false,
    orderer: "Ordering user",
    ordererPlural: "Ordering users",
    ordererPossessive: "your",
    ordererRefersToUnit: "yourself",
  };
}
