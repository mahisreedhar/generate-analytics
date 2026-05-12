import { Models } from 'node-appwrite';

export interface Child extends Models.Document {
  $id: string;
  name: string;
  project: string;
  gender: string;
  date_of_birth: string;
}

export interface Visit extends Models.Document {
  $id: string;
  child: string | Child;
  phase: string;
  visit_date: string;
}

export interface VisitAnswer extends Models.Document {
  visit: string | Visit;
  question: string;
  answer_text: string;
}

export interface AnalyticsDocument {
  project: string;
  child: string;
  visit: string;
  phase: string;
  visit_date: string;
  gender: string;
  ageInMonths: number;
  weight: number;
  height: number;
  measure: string;
  z_weight_for_age: number;
  z_height_for_age: number;
  z_weight_for_height: number;
  z_bmi_for_age: number;
  flag_weight_for_age: boolean;
  flag_height_for_age: boolean;
  flag_weight_for_height: boolean;
  flag_bmi_for_age: boolean;
  computed_bmi: number;
  computed_adjusted_height?: number;
  nutrition_labels: string[];
}

export interface AnthroRequest {
  sex: 'm' | 'f';
  ageInMonths: number;
  weight: number;
  height: number;
  measure: 'l' | 'h';
}

export interface AnthroResponse {
  zWeightForAge: number;
  zHeightForAge: number;
  zWeightForHeight: number;
  zBmiForAge: number;
  flagWeightForAge: boolean;
  flagHeightForAge: boolean;
  flagWeightForHeight: boolean;
  flagBmiForAge: boolean;
  computedBmi: number;
  computedAdjustedHeight?: number;
}

export interface AnthropometricValues {
  weight: number | null;
  height: number | null;
  measure: 'l' | 'h' | null;
}

export interface AppwriteConfig {
  endpoint: string;
  projectId: string;
  apiKey: string;
  databaseId: string;
  childrenCollectionId: string;
  visitsCollectionId: string;
  visitAnswersCollectionId: string;
  analyticsCollectionId: string;
  anthroApiUrl: string;
}

export interface FunctionContext {
  req: {
    body: unknown;
    bodyRaw: string;
    headers: Record<string, string>;
    method: string;
    path: string;
    query: Record<string, string>;
  };
  res: {
    json: (data: unknown, statusCode?: number) => void;
    send: (body: string, statusCode?: number) => void;
    text: (body: string, statusCode?: number) => void;
  };
  log: (msg: string) => void;
  error: (msg: string) => void;
}
