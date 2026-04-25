export const BELLEVUE_GRADES = [
  "KG Blue", "KG Green",
  "1 Green", "1 Blue",
  "2 Green", "2 Blue",
  "3 Green", "3 Blue",
  "Other",
];

export const REDMOND_GRADES = [
  "4 Blue", "4 Green",
  "5 Blue", "5 Green",
  "6", "7", "8", "9", "10",
  "Other",
];

export function getGradesForSchoolName(schoolName: string): string[] {
  const name = schoolName.toLowerCase();
  if (name.includes("bellevue")) return BELLEVUE_GRADES;
  if (name.includes("redmond")) return REDMOND_GRADES;
  // Fallback: show all grades from both campuses
  return [...BELLEVUE_GRADES, ...REDMOND_GRADES];
}
