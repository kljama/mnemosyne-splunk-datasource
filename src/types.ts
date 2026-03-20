import type { DataSourceJsonData, ScopedVars } from '@grafana/data';

/**
 * Query model used by QueryEditor + VariableQueryEditor
 */
export interface SplunkQuery {
  refId: string;
  queryText?: string;
  queryType?: string;
  [key: string]: any;
}

/**
 * Datasource options shown in ConfigEditor (non-secure)
 * These keys match what your ConfigEditor writes into jsonData.
 */
export interface SplunkDataSourceOptions extends DataSourceJsonData {
  // HTTP
  httpHeaderName1?: string; // e.g. "Authorization"

  // Guardrails
  safeMode?: boolean;
  maxRangeSeconds?: number;
  maxRows?: number;
  pageSize?: number;
  pollIntervalMs?: number;
  maxPolls?: number;
  requestTimeoutMs?: number;

  // Commands
  overrideBannedCommands?: boolean;
  bannedCommands?: string; // newline-separated regex fragments
  allowDangerousCommands?: boolean;
}

/**
 * Secure fields saved by ConfigEditor:
 * Grafana stores these encrypted; they are not readable back on the frontend once saved.
 */
export interface SplunkSecureJsonData {
  httpHeaderValue1?: string; // e.g. "Bearer <token>"
}

/** Optional helper alias for template var handling */
export type TemplateVars = ScopedVars;

/** Default query for new panels */
export const DEFAULT_QUERY: SplunkQuery = {
  refId: 'A',
  queryText: '',
  queryType: 'spl',
};

// Backward-compat alias if some files import defaultQuery
export { DEFAULT_QUERY as defaultQuery };
