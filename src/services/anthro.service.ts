import axios, { AxiosError } from 'axios';
import type { AnthroRequest, AnthroResponse } from '../types/index.js';

const MAX_RETRIES = 3;
const TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callAnthroApi(
  apiUrl: string,
  request: AnthroRequest,
  log: (msg: string) => void,
  errorLog: (msg: string) => void
): Promise<AnthroResponse> {
  const url = `${apiUrl.replace(/\/$/, '')}/anthro/zscore`;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`Anthro API attempt ${attempt}/${MAX_RETRIES} → POST ${url}`);
      const { data } = await axios.post<unknown>(url, request, {
        timeout: TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      const response = mapResponse(data);
      log(`Anthro API success on attempt ${attempt}`);
      return response;
    } catch (err) {
      const axErr = err as AxiosError;
      lastError = axErr;
      const status = axErr.response?.status;
      const detail = axErr.message;

      errorLog(`Anthro API attempt ${attempt} failed (HTTP ${status ?? 'timeout'}): ${detail}`);

      // Don't retry client errors (4xx) — they won't heal
      if (status !== undefined && status >= 400 && status < 500) {
        throw new Error(`Anthro API client error ${status}: ${detail}`);
      }

      if (attempt < MAX_RETRIES) {
        const delay = 500 * 2 ** (attempt - 1); // 500ms, 1s, 2s
        log(`Retrying in ${delay}ms…`);
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `Anthro API unreachable after ${MAX_RETRIES} attempts: ${lastError?.message ?? 'unknown'}`
  );
}

function num(value: unknown): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function maybeNum(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  return isNaN(n) ? undefined : n;
}

// Accepts both camelCase and snake_case keys returned by the WHO Anthro API
function mapResponse(data: unknown): AnthroResponse {
  const d = data as Record<string, unknown>;
  return {
    zWeightForAge: num(d['zWeightForAge'] ?? d['waz'] ?? d['z_weight_for_age']),
    zHeightForAge: num(d['zHeightForAge'] ?? d['haz'] ?? d['z_height_for_age']),
    zWeightForHeight: num(d['zWeightForHeight'] ?? d['whz'] ?? d['z_weight_for_height']),
    zBmiForAge: num(d['zBmiForAge'] ?? d['baz'] ?? d['z_bmi_for_age']),
    flagWeightForAge: num(d['flagWeightForAge'] ?? d['fwaz'] ?? d['flag_weight_for_age']),
    flagHeightForAge: num(d['flagHeightForAge'] ?? d['fhaz'] ?? d['flag_height_for_age']),
    flagWeightForHeight: num(d['flagWeightForHeight'] ?? d['fwhz'] ?? d['flag_weight_for_height']),
    flagBmiForAge: num(d['flagBmiForAge'] ?? d['fbaz'] ?? d['flag_bmi_for_age']),
    computedBmi: num(d['computedBmi'] ?? d['bmi'] ?? d['computed_bmi']),
    computedAdjustedHeight: maybeNum(d['computedAdjustedHeight'] ?? d['computed_adjusted_height']),
  };
}
