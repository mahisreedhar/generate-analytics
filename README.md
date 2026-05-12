# generate-analytics

Appwrite Function that automatically computes and stores anthropometric analytics (WHO z-scores, nutrition status) whenever a `visit_answers` document is created or updated.

## How it works

1. An Android app creates/updates `visit_answers` documents for a visit.
2. Appwrite fires a database event and invokes this function.
3. The function fetches the full visit, child profile, and **all** answers for that visit.
4. If `q_weight`, `q_height`, and `q_measure` are all present, it calls the WHO Anthro API.
5. The resulting z-scores and nutrition status are upserted into the `analytics` collection using the **visit ID as the document ID** — guaranteeing idempotency.

```
visit_answers.create / visit_answers.update
        │
        ▼
 extract visit ID
        │
        ▼
 load visit + child + all visit_answers
        │
        ▼
 validate weight / height / measure
        │
        ▼
 WHO Anthro API  (retries: 3, timeout: 15 s)
        │
        ▼
 upsert analytics[visitId]
```

---

## Environment variables

| Variable                      | Description                            | Example                                                  |
| ----------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `APPWRITE_ENDPOINT`           | Appwrite API endpoint                  | `https://cloud.appwrite.io/v1`                           |
| `APPWRITE_PROJECT_ID`         | Appwrite project ID                    | `66abc123def`                                            |
| `APPWRITE_API_KEY`            | Server API key (needs DB read + write) | `standard_abc123…`                                       |
| `DATABASE_ID`                 | Appwrite database ID                   | `main`                                                   |
| `CHILDREN_COLLECTION_ID`      | Collection: `children`                 | `children`                                               |
| `VISITS_COLLECTION_ID`        | Collection: `visits`                   | `visits`                                                 |
| `VISIT_ANSWERS_COLLECTION_ID` | Collection: `visit_answers`            | `visit_answers`                                          |
| `ANALYTICS_COLLECTION_ID`     | Collection: `analytics`                | `analytics`                                              |
| `ANTHRO_API_URL`              | Base URL of the WHO Anthro z-score API | `https://who-anthro-analytics-production.up.railway.app` |

---

## Appwrite trigger configuration

In the Appwrite Console (or `appwrite.json`) configure **two** events for the function:

```
databases.<DATABASE_ID>.collections.<VISIT_ANSWERS_COLLECTION_ID>.documents.*.create
databases.<DATABASE_ID>.collections.<VISIT_ANSWERS_COLLECTION_ID>.documents.*.update
```

Or use wildcard form if your Appwrite version supports it:

```
databases.*.collections.*.documents.*.create
databases.*.collections.*.documents.*.update
```

### Function settings

| Setting           | Value                          |
| ----------------- | ------------------------------ |
| Runtime           | Node.js 20                     |
| Entrypoint        | `dist/main.js`                 |
| Build command     | `npm install && npm run build` |
| Timeout (seconds) | 30                             |
| Permissions       | Server (API key)               |

---

## Deployment

### Via Appwrite CLI

```bash
# Install CLI
npm install -g appwrite-cli

# Login
appwrite login

# Deploy (reads appwrite.json if present, else prompts)
appwrite deploy function --functionId generate-analytics
```

### Via Appwrite Console

1. Go to **Functions** → **Create Function**.
2. Set runtime to **Node.js 20**.
3. Set entrypoint to `dist/main.js`.
4. Set build command to `npm install && npm run build`.
5. Upload the project as a ZIP **or** connect your Git repository.
6. Add all environment variables from the table above.
7. Add the two trigger events listed above.
8. Deploy.

---

## Local development

### Prerequisites

- Node.js ≥ 20
- An `.env` file with all required variables

### Install & build

```bash
npm install
npm run build        # compiles TypeScript → dist/
npm run typecheck    # type-check without emitting
```

### Simulate a function trigger locally

The Appwrite Function handler receives a context object. You can test it by
creating a small runner script:

```js
// test-local.mjs
import handler from './dist/main.js';

const fakeVisitAnswer = {
  $id: 'ans_001',
  visit: 'visit_abc123', // the visit ID
  question: 'q_weight',
  answer_text: '12.5',
};

await handler({
  req: {
    body: fakeVisitAnswer,
    bodyRaw: JSON.stringify(fakeVisitAnswer),
    headers: {
      'x-appwrite-event':
        'databases.main.collections.visit_answers.documents.ans_001.create',
    },
    method: 'POST',
    path: '/',
    query: {},
  },
  res: {
    json: (data, status = 200) =>
      console.log(status, JSON.stringify(data, null, 2)),
    send: (body, status = 200) => console.log(status, body),
    text: (body, status = 200) => console.log(status, body),
  },
  log: (msg) => console.log('[LOG]', msg),
  error: (msg) => console.error('[ERR]', msg),
});
```

```bash
node --env-file=.env test-local.mjs
```

### Backfill analytics for existing children

The backfill script pages through the `children` collection, loads each child's visits,
recomputes Anthro scores, and upserts one analytics document per visit.

Run a dry pass first. This reads only 5 children, runs the analytics pipeline,
prints the analytics payloads, and skips DB writes:

```bash
npm run build
node --env-file=.env dist/scripts/backfill-analytics.js --dry-run
```

Run the real backfill:

```bash
npm run build
node --env-file=.env dist/scripts/backfill-analytics.js --batch-size 50 --concurrency 3
```

Backfill one child:

```bash
npm run build
node --env-file=.env dist/scripts/backfill-analytics.js --child-id child_abc123
```

Options:

| Option          | Default | Description                                   |
| --------------- | ------- | --------------------------------------------- |
| `--batch-size`  | `50`    | Number of children loaded per Appwrite page   |
| `--concurrency` | `3`     | Number of children processed at the same time |
| `--dry-run`     | `false` | Compute and log payloads without DB writes    |
| `--child-id`    | n/a     | Process only one child                        |

---

## Analytics document structure

The function writes to the `analytics` collection using the **visit ID** as the document `$id`.

| Field                      | Type     | Source                         |
| -------------------------- | -------- | ------------------------------ |
| `project`                  | string   | `child.project`                |
| `child`                    | string   | `child.$id`                    |
| `visit`                    | string   | `visit.$id`                    |
| `phase`                    | string   | `visit.phase`                  |
| `visit_date`               | string   | `visit.visit_date`             |
| `gender`                   | string   | `child.gender`                 |
| `ageInMonths`              | integer  | computed completed months      |
| `weight`                   | float    | `q_weight` answer              |
| `height`                   | float    | `q_height` answer              |
| `measure`                  | string   | `q_measure` answer (`l` / `h`) |
| `z_weight_for_age`         | float    | WHO Anthro API                 |
| `z_height_for_age`         | float    | WHO Anthro API                 |
| `z_weight_for_height`      | float    | WHO Anthro API                 |
| `z_bmi_for_age`            | float    | WHO Anthro API                 |
| `flag_*`                   | boolean  | WHO Anthro API flags           |
| `computed_bmi`             | float    | WHO Anthro API                 |
| `computed_adjusted_height` | float?   | WHO Anthro API (optional)      |
| `nutrition_labels`         | string[] | Computed nutrition labels      |

---

## Nutrition status rules

| Condition     | Status   |
| ------------- | -------- |
| WHZ < −3      | `SAM`    |
| −3 ≤ WHZ < −2 | `MAM`    |
| WHZ ≥ −2      | `NORMAL` |

---

## `q_measure` accepted values

The function normalises the raw string from `visit_answers`:

| Raw value                  | Normalised               |
| -------------------------- | ------------------------ |
| `l`, `lying`, `recumbent`  | `l` (recumbent / length) |
| `h`, `standing`, `upright` | `h` (standing / height)  |
