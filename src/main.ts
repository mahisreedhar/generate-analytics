import type { FunctionContext, AppwriteConfig } from './types/index.js';
import { createAppwriteClient } from './services/appwrite.service.js';
import { processVisit } from './services/analytics.service.js';
import { resolveId } from './utils/extract.util.js';

function loadConfig(): AppwriteConfig {
  const vars = [
    'APPWRITE_ENDPOINT',
    'APPWRITE_PROJECT_ID',
    'APPWRITE_API_KEY',
    'DATABASE_ID',
    'CHILDREN_COLLECTION_ID',
    'VISITS_COLLECTION_ID',
    'VISIT_ANSWERS_COLLECTION_ID',
    'ANALYTICS_COLLECTION_ID',
    'ANTHRO_API_URL',
  ] as const;

  for (const key of vars) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    endpoint: process.env['APPWRITE_ENDPOINT']!,
    projectId: process.env['APPWRITE_PROJECT_ID']!,
    apiKey: process.env['APPWRITE_API_KEY']!,
    databaseId: process.env['DATABASE_ID']!,
    childrenCollectionId: process.env['CHILDREN_COLLECTION_ID']!,
    visitsCollectionId: process.env['VISITS_COLLECTION_ID']!,
    visitAnswersCollectionId: process.env['VISIT_ANSWERS_COLLECTION_ID']!,
    analyticsCollectionId: process.env['ANALYTICS_COLLECTION_ID']!,
    anthroApiUrl: process.env['ANTHRO_API_URL']!,
  };
}

export default async ({ req, res, log, error }: FunctionContext) => {
  log('[main] generate-analytics function triggered');
  log(`[main] Event: ${req.headers['x-appwrite-event'] ?? 'unknown'}`);

  try {
    const config = loadConfig();
    const db = createAppwriteClient(config);

    // Parse body — Appwrite sends the triggering document as JSON
    let doc: Record<string, unknown>;
    try {
      doc =
        req.body !== null && typeof req.body === 'object'
          ? (req.body as Record<string, unknown>)
          : JSON.parse(String(req.body ?? req.bodyRaw ?? '{}'));
    } catch {
      error('[main] Failed to parse request body as JSON');
      return res.json({ success: false, message: 'Invalid JSON body' }, 400);
    }

    log(`[main] Document $id: ${doc['$id'] ?? 'n/a'}`);

    // Extract visit ID from the visit_answers document
    const visitField = doc['visit'];
    const visitId = resolveId(
      visitField as string | { $id: string } | undefined
    );

    if (!visitId) {
      error('[main] visit field is missing or empty in visit_answers document');
      return res.json({ success: false, message: 'visit field missing' }, 400);
    }

    log(`[main] Resolved visit ID: ${visitId}`);

    await processVisit(db, config, visitId, log, error);

    return res.json({ success: true, visitId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    error(`[main] Unhandled error: ${message}`);
    if (stack) error(stack);
    return res.json({ success: false, message }, 500);
  }
};
