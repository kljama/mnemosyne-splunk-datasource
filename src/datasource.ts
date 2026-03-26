import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import {
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  FieldType,
  MetricFindValue,
  MutableDataFrame,
} from '@grafana/data';
import type { SplunkDataSourceOptions, SplunkQuery } from './types';

// ---------- Guardrails ----------
function compileBannedRegex(opts: SplunkDataSourceOptions): RegExp | null {
  const src = (opts.bannedCommands ?? '').trim();
  if (!src) {
    return null;
  }
  const parts = src
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) {
    return null;
  }
  return new RegExp(`\\b(${parts.join('|')})\\b`, 'i');
}


// ---------- Helpers ----------
function toSplunkTimeISO(d: Date): string {
  const s = d.toISOString();
  return s.replace(/\.\d{3}Z$/, 'Z');
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function escapeSplunkValue(v: string): string {
  // Escape quotes and backslashes for safe embedding
  return String(v).replace(/(["\\])/g, '\\$1');
}

/**
 * Interpolates Grafana variables into SPL.
 * - Single value: just escapes (no extra quotes are added).
 *   So if user wrote host="$device*", result becomes host="sr-zw-1a02-1*"
 * - Multi value: ("v1" OR "v2")
 */
function interpolateSPL(text: string, scopedVars: any): string {
  const ts = getTemplateSrv();
  const formatter = (value: any) => {
    if (value == null) {
      return '';
    }
    if (Array.isArray(value)) {
      const parts = value.map((v) => `"${escapeSplunkValue(String(v))}"`);
      return parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0] ?? '';
    }
    return escapeSplunkValue(String(value));
  };
  return ts.replace(text, scopedVars, formatter);
}

// Splunk payloads (data payloads only)
type SplunkJobCreateData = { sid: string };
type SplunkJobStatusData = { entry?: Array<{ content?: { isDone?: boolean; dispatchState?: string } }> };
type SplunkResultsData = { results?: Array<Record<string, any>>; fields?: Array<{ name: string }> };

// ---------- DataSource ----------
export class DataSource extends DataSourceApi<SplunkQuery, SplunkDataSourceOptions> {
  readonly jsonData: SplunkDataSourceOptions;
  // This is the *Grafana-proxied* base URL, e.g. /api/datasources/proxy/uid/<UID>
  private readonly base: string;
  private readonly bannedRegex: RegExp | null;

  constructor(instanceSettings: DataSourceInstanceSettings<SplunkDataSourceOptions>) {
    super(instanceSettings);
    this.jsonData = instanceSettings.jsonData || {};
    const raw = (instanceSettings as any).url ?? (this.jsonData as any)?.url ?? '';
    this.base = String(raw).replace(/\/+$/, '');
    this.bannedRegex = compileBannedRegex(this.jsonData);
  }

  private isQueryDangerous(q: string | undefined): string | null {
    const text = (q ?? '').trim();
    if (!text.length) {
      return 'Query is empty.';
    }
    if (this.jsonData.allowDangerousCommands) {
      return null;
    }
    if (this.bannedRegex && this.bannedRegex.test(text)) {
      return 'Query includes a risky Splunk command and is blocked by guardrails.';
    }
    return null;
  }

  // ---------------- Query (Panels) ----------------
  async query(req: DataQueryRequest<SplunkQuery>): Promise<DataQueryResponse> {
    // Guardrail: time range cap
    if (this.jsonData.safeMode) {
      const maxRangeSec = this.jsonData.maxRangeSeconds ?? 24 * 60 * 60;
      const rangeSec = Math.ceil((+req.range.to.valueOf() - +req.range.from.valueOf()) / 1000);
      if (rangeSec > maxRangeSec) {
        const info = new MutableDataFrame({
          refId: 'guardrails',
          fields: [
            { name: 'time', type: FieldType.time },
            { name: 'message', type: FieldType.string },
          ],
        });
        info.add({
          time: Date.now(),
          message: `Time range (${rangeSec}s) exceeds the configured cap (${maxRangeSec}s).`,
        });
        return { data: [info] };
      }
    }

    const frames: DataFrame[] = [];

    for (const target of req.targets) {
      if (target.hide) {
        continue;
      }

      // Interpolate dashboard variables into the SPL
      const rawText = target.queryText || '';
      const queryText = interpolateSPL(rawText, req.scopedVars);

      const validation = this.isQueryDangerous(queryText);
      if (validation) {
        const warn = new MutableDataFrame({
          refId: target.refId,
          fields: [
            { name: 'time', type: FieldType.time },
            { name: 'warning', type: FieldType.string },
          ],
        });
        warn.add({ time: Date.now(), warning: validation });
        frames.push(warn);
        continue;
      }

      // Accumulate columns in arrays first (optimization)
      const timeValues: number[] = [];
      const hostValues: string[] = [];
      const msgValues: string[] = [];

      try {
        const earliest = toSplunkTimeISO(req.range.from.toDate());
        const latest = toSplunkTimeISO(req.range.to.toDate());

        const { sid } = await this.createSearchJob(queryText, earliest, latest);
        await this.waitForJob(sid);

        // Page results until we hit maxRows (guardrail) or no more rows
        const pageSize = Math.max(1, Math.min(this.jsonData.pageSize ?? 200, 5000));
        const maxRows = Math.max(0, this.jsonData.maxRows ?? 2000);
        let offset = 0;
        let totalAdded = 0;

        while (true) {
          const res = await this.fetchResults(sid, pageSize, offset);
          const rows = res.results ?? [];
          if (!rows.length) {
            break;
          }

          for (const r of rows) {
            const t = Date.parse(r._time) || Date.now();
            const host = r.host ?? r.sourceHost ?? r.hosts ?? '';
            const msg = r._raw ?? r.message ?? r._msg ?? '';

            timeValues.push(t);
            hostValues.push(host);
            msgValues.push(msg);
          }

          totalAdded += rows.length;
          if (maxRows > 0 && totalAdded >= maxRows) {
            break;
          }

          offset += rows.length;
          if (rows.length < pageSize) {
            break;
          }
        }
      } catch (err: any) {
        const e = new MutableDataFrame({
          refId: target.refId,
          fields: [
            { name: 'time', type: FieldType.time },
            { name: 'error', type: FieldType.string },
          ],
        });
        e.add({ time: Date.now(), error: err?.message ?? 'Query failed' });
        frames.push(e);
        continue;
      }

      const table = new MutableDataFrame({
        refId: target.refId,
        fields: [
          { name: 'time', type: FieldType.time, values: timeValues },
          { name: 'host', type: FieldType.string, values: hostValues },
          { name: 'message', type: FieldType.string, values: msgValues },
        ],
      });

      frames.push(table);
    }

    return { data: frames };
  }

  // ---------------- Variables ----------------
  async metricFindQuery(query: SplunkQuery | string): Promise<MetricFindValue[]> {
    const raw = typeof query === 'string' ? query : query.queryText ?? '';
    // Interpolate variables here too (in case user references dashboard vars)
    const qText = interpolateSPL(raw, {});
    const validation = this.isQueryDangerous(qText);
    if (validation) {
      return [];
    }

    // Use a cheap time window for variables
    const earliest = '-15m';
    const latest = 'now';

    try {
      const { sid } = await this.createSearchJob(qText, earliest, latest);
      await this.waitForJob(sid);
      const res = await this.fetchResults(sid, 500, 0);
      const rows = res.results ?? [];
      if (!rows.length) {
        return [];
      }

      let firstField = res.fields?.[0]?.name;
      if (!firstField) {
        firstField = Object.keys(rows[0] ?? {})[0];
      }
      if (!firstField) {
        return [];
      }

      return rows
        .map((r) => r[firstField!])
        .filter((v) => v != null && v !== '')
        .map((v) => ({ text: String(v), value: String(v) }));
    } catch {
      return [];
    }
  }

  // ---------------- Health ----------------
  async testDatasource() {
    try {
      await getBackendSrv().datasourceRequest<any>({
        url: `${this.base}/services/server/info?output_mode=json`,
        method: 'GET',
      });
      return { status: 'success', message: 'OK' };
    } catch (err: any) {
      return { status: 'error', message: err?.message ?? 'Connection failed' };
    }
  }

  // ---------- Splunk REST via Grafana proxy ----------
  private async createSearchJob(search: string, earliest: string, latest: string): Promise<SplunkJobCreateData> {
    const form = new URLSearchParams();
    form.set('search', search);
    form.set('earliest_time', earliest);
    form.set('latest_time', latest);
    form.set('output_mode', 'json');

    const resp: any = await getBackendSrv().datasourceRequest({
      url: `${this.base}/services/search/jobs`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: form.toString(),
    });

    const data: SplunkJobCreateData = resp?.data ?? resp;
    const { sid } = data || {};
    if (!sid) {
      throw new Error('Failed to create Splunk search job');
    }
    return { sid };
  }

  private async waitForJob(sid: string): Promise<void> {
    const pollMs = Math.max(100, this.jsonData.pollIntervalMs ?? 1000);
    const maxPolls = Math.max(1, this.jsonData.maxPolls ?? 30);

    for (let i = 0; i < maxPolls; i++) {
      const done = await this.isJobDone(sid);
      if (done) {
        return;
      }
      await sleep(pollMs);
    }
    throw new Error('Splunk job did not complete within polling limits');
  }

  private async isJobDone(sid: string): Promise<boolean> {
    const resp: any = await getBackendSrv().datasourceRequest({
      url: `${this.base}/services/search/jobs/${encodeURIComponent(sid)}?output_mode=json`,
      method: 'GET',
    });
    const data: SplunkJobStatusData = resp?.data ?? resp;
    const entry = data.entry?.[0];
    const done = entry?.content?.isDone;
    const state = entry?.content?.dispatchState;
    return !!done || state === 'DONE' || state === 'PAUSED' || state === 'FINALIZING';
  }

  private async fetchResults(sid: string, count: number, offset: number): Promise<SplunkResultsData> {
    const resp: any = await getBackendSrv().datasourceRequest({
      url: `${this.base}/services/search/jobs/${encodeURIComponent(
        sid
      )}/results?output_mode=json&count=${count}&offset=${offset}`,
      method: 'GET',
    });
    const data: SplunkResultsData = resp?.data ?? resp;
    return data;
  }
}
