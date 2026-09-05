// Generic K-12 fallback shown when a school hasn't configured its own
// grades list yet (School.grades is empty). Real, per-school grade lists
// are now stored as data (School.grades, editable in Admin > Locations)
// rather than guessed from the school's name -- this used to be a
// hardcoded Bellevue/Redmond-specific list matched by a substring check
// on the school name, a leftover from this platform's original
// single-tenant predecessor app that never generalized correctly for
// other tenants' schools.
export const STANDARD_GRADES = [
  "Pre-K",
  "Kindergarten",
  "1st Grade",
  "2nd Grade",
  "3rd Grade",
  "4th Grade",
  "5th Grade",
  "6th Grade",
  "7th Grade",
  "8th Grade",
  "9th Grade",
  "10th Grade",
  "11th Grade",
  "12th Grade",
  "Other",
];
