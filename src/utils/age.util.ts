/**
 * Age in completed months, using 30.4375 as the mean days per month.
 * Appwrite stores ageInMonths as an integer.
 */
export function computeAgeInMonths(
  date_of_birth: string,
  visitDate: string
): number {
  const dobMs = new Date(date_of_birth).getTime();
  const visitMs = new Date(visitDate).getTime();

  if (isNaN(dobMs) || isNaN(visitMs)) {
    throw new Error(
      `Invalid date values: date_of_birth="${date_of_birth}", visitDate="${visitDate}"`
    );
  }

  const diffDays = (visitMs - dobMs) / (1000 * 60 * 60 * 24);
  return Math.floor(diffDays / 30.4375);
}
