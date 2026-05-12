export type NutritionLabels = 'SAM' | 'MAM' | 'NORMAL' | 'UNDERWEIGHT' | 'STUNTED' | 'OVERWEIGHT' | 'OBESE' | 'SEVERELY_UNDERWEIGHT' | 'SEVERELY_STUNTED' | 'WASTED';

export function computeNutritionLabels(zWeightForHeight: number, zWeightForAge: number, zHeightForAge: number, bmiForAge: number): NutritionLabels[] {
  const labels: NutritionLabels[] = [];
  if (zWeightForHeight <= -3) labels.push('SAM');
  if (zWeightForHeight < -2 && zWeightForHeight > -3) labels.push('MAM');
  if (zWeightForAge < -2 && zWeightForAge > -3) labels.push('UNDERWEIGHT');
  if (zHeightForAge < -2 && zHeightForAge > -3) labels.push('STUNTED');
  if (zWeightForHeight > 2) labels.push('OVERWEIGHT');
  if (bmiForAge > 2) labels.push('OBESE');
  if (zWeightForAge < -3) labels.push('SEVERELY_UNDERWEIGHT');
  if (zHeightForAge < -3) labels.push('SEVERELY_STUNTED');
  if (zWeightForHeight < -2) labels.push('WASTED');
  if (labels.length === 0) labels.push('NORMAL');
  return labels;
}
