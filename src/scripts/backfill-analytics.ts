import type { AppwriteConfig, Child } from '../types/index.js';
import {
  createAppwriteClient,
  getVisitsForChild,
  listChildren,
} from '../services/appwrite.service.js';
import { processVisit } from '../services/analytics.service.js';

const DRY_RUN_CHILD_LIMIT = 5;

type BackfillOptions = {
  batchSize: number;
  concurrency: number;
  dryRun: boolean;
  childId?: string;
};

type BackfillStats = {
  childrenSeen: number;
  visitsSeen: number;
  visitsCompleted: number;
  visitsFailed: number;
};

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

function parseArgs(argv: string[]): BackfillOptions {
  const options: BackfillOptions = {
    batchSize: 50,
    concurrency: 3,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--batch-size') {
      options.batchSize = parsePositiveInt(argv[++i], '--batch-size');
    } else if (arg === '--concurrency') {
      options.concurrency = parsePositiveInt(argv[++i], '--concurrency');
    } else if (arg === '--child-id') {
      const childId = argv[++i];
      if (!childId) throw new Error('--child-id requires a value');
      options.childId = childId;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parsePositiveInt(value: string | undefined, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return n;
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex++];
        await task(item);
      }
    }
  );

  await Promise.all(workers);
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const childBatchSize =
    options.dryRun && !options.childId
      ? DRY_RUN_CHILD_LIMIT
      : options.batchSize;
  const config = loadConfig();
  const db = createAppwriteClient(config);
  const stats: BackfillStats = {
    childrenSeen: 0,
    visitsSeen: 0,
    visitsCompleted: 0,
    visitsFailed: 0,
  };

  const log = (msg: string) => console.log(msg);
  const errorLog = (msg: string) => console.error(msg);

  log(
    `[backfill] Starting analytics backfill ` +
      `(batchSize=${childBatchSize}, concurrency=${options.concurrency}, dryRun=${options.dryRun})`
  );

  if (options.dryRun && !options.childId) {
    log(
      `[backfill] Dry run enabled; reading only ${DRY_RUN_CHILD_LIMIT} children`
    );
  }

  if (options.childId) {
    await processChild({ $id: options.childId } as Child);
  } else {
    let offset = 0;

    while (true) {
      const children = await listChildren(
        db,
        config.databaseId,
        config.childrenCollectionId,
        childBatchSize,
        offset
      );

      if (children.length === 0) break;

      log(
        `[backfill] Processing child batch offset=${offset}, size=${children.length}`
      );
      await mapWithConcurrency(children, options.concurrency, processChild);

      offset += children.length;
      if (options.dryRun || children.length < childBatchSize) break;
    }
  }

  log(
    `[backfill] Finished. children=${stats.childrenSeen}, visits=${stats.visitsSeen}, ` +
      `completed=${stats.visitsCompleted}, failed=${stats.visitsFailed}`
  );

  if (stats.visitsFailed > 0) {
    process.exitCode = 1;
  }

  async function processChild(child: Child): Promise<void> {
    stats.childrenSeen += 1;
    log(`[backfill] Loading visits for child ${child.$id}`);

    let visits;
    try {
      visits = await getVisitsForChild(
        db,
        config.databaseId,
        config.visitsCollectionId,
        child.$id
      );
    } catch (err) {
      stats.visitsFailed += 1;
      errorLog(
        `[backfill] Failed to load visits for child ${child.$id}: ${formatError(err)}`
      );
      return;
    }

    stats.visitsSeen += visits.length;
    if (visits.length === 0) {
      log(`[backfill] No visits found for child ${child.$id}`);
      return;
    }

    for (const visit of visits) {
      try {
        await processVisit(db, config, visit.$id, log, errorLog, {
          dryRun: options.dryRun,
        });
        stats.visitsCompleted += 1;
      } catch (err) {
        stats.visitsFailed += 1;
        errorLog(
          `[backfill] Failed visit ${visit.$id} for child ${child.$id}: ${formatError(err)}`
        );
      }
    }
  }
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

run().catch((err) => {
  console.error(`[backfill] Unhandled error: ${formatError(err)}`);
  process.exit(1);
});
