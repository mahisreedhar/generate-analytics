import type { Databases } from 'node-appwrite';
import type { AppwriteConfig } from '../types/index.js';
import {
  getVisit,
  getChild,
  getAllVisitAnswers,
  upsertAnalytics,
} from './appwrite.service.js';
import { callAnthroApi } from './anthro.service.js';
import { extractAnthropometricValues, normalizeGender, resolveId } from '../utils/extract.util.js';
import { computeAgeInMonths } from '../utils/age.util.js';
import { computeNutritionStatus } from '../utils/nutrition.util.js';

export async function processVisit(
  db: Databases,
  config: AppwriteConfig,
  visitId: string,
  log: (msg: string) => void,
  errorLog: (msg: string) => void
): Promise<void> {
  log(`[analytics] Processing visit: ${visitId}`);

  // ── 1. Load visit ─────────────────────────────────────────────────────────
  const visit = await getVisit(db, config.databaseId, config.visitsCollectionId, visitId);
  log(`[analytics] Visit loaded: phase=${visit.phase}, date=${visit.visit_date}`);

  // ── 2. Load child ─────────────────────────────────────────────────────────
  const childId = resolveId(visit.child as string | { $id: string });
  if (!childId) {
    errorLog(`[analytics] visit.child is missing for visit ${visitId}. Aborting.`);
    return;
  }

  const child = await getChild(db, config.databaseId, config.childrenCollectionId, childId);
  log(`[analytics] Child loaded: id=${child.$id}, gender=${child.gender}, dob=${child.dob}`);

  // ── 3. Load all visit_answers for this visit ───────────────────────────────
  const answers = await getAllVisitAnswers(
    db,
    config.databaseId,
    config.visitAnswersCollectionId,
    visitId
  );
  log(`[analytics] ${answers.length} visit_answers loaded`);

  // ── 4. Extract anthropometric values ──────────────────────────────────────
  const { weight, height, measure } = extractAnthropometricValues(answers);

  if (weight === null || height === null || measure === null) {
    log(
      `[analytics] Incomplete anthropometric data for visit ${visitId} ` +
        `(weight=${weight}, height=${height}, measure=${measure}). Skipping.`
    );
    return;
  }

  // ── 5. Validate gender ────────────────────────────────────────────────────
  const sex = normalizeGender(child.gender);
  if (!sex) {
    errorLog(
      `[analytics] Unrecognised gender "${child.gender}" for child ${child.$id}. Skipping.`
    );
    return;
  }

  // ── 6. Compute age in months ──────────────────────────────────────────────
  const ageInMonths = computeAgeInMonths(child.dob, visit.visit_date);
  if (ageInMonths < 0) {
    errorLog(
      `[analytics] Negative age (${ageInMonths.toFixed(2)} months) for visit ${visitId}. ` +
        `dob=${child.dob}, visit_date=${visit.visit_date}. Skipping.`
    );
    return;
  }
  log(`[analytics] Age in months: ${ageInMonths.toFixed(4)}`);

  // ── 7. Call WHO Anthro API ────────────────────────────────────────────────
  const anthro = await callAnthroApi(
    config.anthroApiUrl,
    { sex, ageInMonths, weight, height, measure },
    log,
    errorLog
  );
  log(
    `[analytics] Z-scores — WAZ=${anthro.zWeightForAge.toFixed(3)}, ` +
      `HAZ=${anthro.zHeightForAge.toFixed(3)}, WHZ=${anthro.zWeightForHeight.toFixed(3)}, ` +
      `BAZ=${anthro.zBmiForAge.toFixed(3)}`
  );

  // ── 8. Compute nutrition status ───────────────────────────────────────────
  const nutritionStatus = computeNutritionStatus(anthro.zWeightForHeight);
  log(`[analytics] Nutrition status: ${nutritionStatus}`);

  // ── 9. Build analytics payload ────────────────────────────────────────────
  const payload: Record<string, unknown> = {
    project: child.project,
    child: child.$id,
    visit: visit.$id,
    phase: visit.phase,
    visit_date: visit.visit_date,
    created_by: visit.created_by,
    gender: child.gender,
    ageInMonths,
    weight,
    height,
    measure,
    z_weight_for_age: anthro.zWeightForAge,
    z_height_for_age: anthro.zHeightForAge,
    z_weight_for_height: anthro.zWeightForHeight,
    z_bmi_for_age: anthro.zBmiForAge,
    flag_weight_for_age: anthro.flagWeightForAge,
    flag_height_for_age: anthro.flagHeightForAge,
    flag_weight_for_height: anthro.flagWeightForHeight,
    flag_bmi_for_age: anthro.flagBmiForAge,
    computed_bmi: anthro.computedBmi,
    nutrition_status: nutritionStatus,
  };

  if (anthro.computedAdjustedHeight !== undefined) {
    payload['computed_adjusted_height'] = anthro.computedAdjustedHeight;
  }

  // ── 10. Upsert analytics (document ID == visitId for idempotency) ─────────
  log(`[analytics] Upserting analytics document id=${visitId}`);
  const action = await upsertAnalytics(
    db,
    config.databaseId,
    config.analyticsCollectionId,
    visitId,
    payload
  );

  log(`[analytics] Analytics document ${action} successfully for visit ${visitId}`);
}
