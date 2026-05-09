/**
 * WHO standard: age in months = exact day difference / 30.4375 (mean days per month).
 * Returns a decimal value; z-score APIs accept fractional months.
 */
export function computeAgeInMonths(dob: string, visitDate: string): number {
  const dobMs = new Date(dob).getTime();
  const visitMs = new Date(visitDate).getTime();

  if (isNaN(dobMs) || isNaN(visitMs)) {
    throw new Error(`Invalid date values: dob="${dob}", visitDate="${visitDate}"`);
  }

  const diffDays = (visitMs - dobMs) / (1000 * 60 * 60 * 24);
  return diffDays / 30.4375;
}
