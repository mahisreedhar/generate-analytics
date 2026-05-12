import { Client, Databases, Query } from 'node-appwrite';
import type {
  Child,
  Visit,
  VisitAnswer,
  AppwriteConfig,
} from '../types/index.js';

export function createAppwriteClient(config: AppwriteConfig): Databases {
  const client = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId)
    .setKey(config.apiKey);

  return new Databases(client);
}

export async function getVisit(
  db: Databases,
  databaseId: string,
  collectionId: string,
  visitId: string
): Promise<Visit> {
  return db.getDocument<Visit>(databaseId, collectionId, visitId);
}

export async function getChild(
  db: Databases,
  databaseId: string,
  collectionId: string,
  childId: string
): Promise<Child> {
  return db.getDocument<Child>(databaseId, collectionId, childId);
}

export async function listChildren(
  db: Databases,
  databaseId: string,
  collectionId: string,
  limit: number,
  offset: number
): Promise<Child[]> {
  const page = await db.listDocuments<Child>(databaseId, collectionId, [
    Query.limit(limit),
    Query.offset(offset),
  ]);

  return page.documents;
}

export async function getVisitsForChild(
  db: Databases,
  databaseId: string,
  collectionId: string,
  childId: string
): Promise<Visit[]> {
  const results: Visit[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const page = await db.listDocuments<Visit>(databaseId, collectionId, [
      Query.equal('child', childId),
      Query.limit(limit),
      Query.offset(offset),
    ]);

    results.push(...page.documents);
    if (page.documents.length < limit) break;
    offset += limit;
  }

  return results;
}

export async function getAllVisitAnswers(
  db: Databases,
  databaseId: string,
  collectionId: string,
  visitId: string
): Promise<VisitAnswer[]> {
  const results: VisitAnswer[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const page = await db.listDocuments<VisitAnswer>(databaseId, collectionId, [
      Query.equal('visit', visitId),
      Query.limit(limit),
      Query.offset(offset),
    ]);

    results.push(...page.documents);
    if (page.documents.length < limit) break;
    offset += limit;
  }

  return results;
}

export async function upsertAnalytics(
  db: Databases,
  databaseId: string,
  collectionId: string,
  visitId: string,
  payload: Record<string, unknown>
): Promise<'created' | 'updated'> {
  const now = new Date().toISOString();

  try {
    await db.getDocument(databaseId, collectionId, visitId);
    // Document exists — partial update
    const { ...updatePayload } = payload as Record<
      string,
      unknown
    >;
    await db.updateDocument(databaseId, collectionId, visitId, {
      ...updatePayload,
    });
    return 'updated';
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    const type = (err as { type?: string })?.type;
    if (code === 404 || type === 'document_not_found') {
      await db.createDocument(databaseId, collectionId, visitId, {
        ...payload,
      });
      return 'created';
    }
    throw err;
  }
}
