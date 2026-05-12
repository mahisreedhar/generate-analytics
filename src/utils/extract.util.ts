import type { VisitAnswer, AnthropometricValues } from '../types/index.js';

const Q_WEIGHT = 'q65_current_weight';
const Q_HEIGHT = 'q66_current_height_length';
const Q_MEASURE = 'q_measure';

export function extractAnthropometricValues(answers: VisitAnswer[]): AnthropometricValues {
  const weightAnswer = answers.find((a) => a.question === Q_WEIGHT);
  const heightAnswer = answers.find((a) => a.question === Q_HEIGHT);
  const measureAnswer = answers.find((a) => a.question === Q_MEASURE);

  const weight = parseNullableFloat(weightAnswer?.answer_text);
  const height = parseNullableFloat(heightAnswer?.answer_text);
  const measure = normalizeMeasure(measureAnswer?.answer_text);

  return { weight, height, measure };
}

export function normalizeGender(raw: string | undefined): 'm' | 'f' | null {
  const g = raw?.trim().toLowerCase();
  if (g === 'm' || g === 'male') return 'm';
  if (g === 'f' || g === 'female') return 'f';
  return null;
}

function parseNullableFloat(value: string | undefined): number | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

function normalizeMeasure(value: string | undefined): 'l' | 'h' | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (v === 'l' || v === 'lying' || v === 'recumbent') return 'l';
  if (v === 'h' || v === 'standing' || v === 'upright') return 'h';
  return null;
}

export function resolveId(field: string | { $id: string } | undefined): string | null {
  if (!field) return null;
  if (typeof field === 'string') return field;
  return field.$id ?? null;
}
