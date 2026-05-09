export type NutritionStatus = 'SAM' | 'MAM' | 'NORMAL';

export function computeNutritionStatus(zWeightForHeight: number): NutritionStatus {
  if (zWeightForHeight < -3) return 'SAM';
  if (zWeightForHeight < -2) return 'MAM';
  return 'NORMAL';
}
