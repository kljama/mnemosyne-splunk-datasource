import { DataSource } from './datasource';
import { DataSourceInstanceSettings } from '@grafana/data';
import { SplunkDataSourceOptions } from './types';

// Mock getBackendSrv
const mockDatasourceRequest = jest.fn();
jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getBackendSrv: () => ({
    datasourceRequest: mockDatasourceRequest,
  }),
  getTemplateSrv: () => ({
    replace: (text: string) => text,
  }),
}));

describe('DataSource Performance', () => {
  const instanceSettings = {
    jsonData: {
      url: 'http://localhost:8000',
    },
  } as unknown as DataSourceInstanceSettings<SplunkDataSourceOptions>;

  const ds = new DataSource(instanceSettings);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('benchmark query processing', async () => {
    const rowCount = 1000;
    const rows = Array.from({ length: rowCount }, (_, i) => ({
      _time: new Date().toISOString(),
      host: `host-${i}`,
      _raw: `message-${i}`,
    }));

    // Mock create job
    mockDatasourceRequest.mockImplementation((options) => {
      if (options.url.includes('/services/search/jobs') && options.method === 'POST') {
        return Promise.resolve({ data: { sid: 'job-123' } });
      }
      if (options.url.includes('/services/search/jobs/job-123') && options.method === 'GET') {
        if (options.url.includes('/results')) {
          // Return all results in one go to simulate fetching large data
          // The code pages, but we can simulate one huge page or just ensure logic handles it.
          // Current code pages if rows.length < pageSize.
          // We'll set pageSize to rowCount + 1 to avoid multiple calls in this specific mock if possible,
          // but code respects jsonData.pageSize.

          // Let's mimic paging if we want, or just return all if we control pageSize.
          // The code limits pageSize to 5000 max.
          // So we will get multiple calls.

          const urlObj = new URL(options.url, 'http://localhost');
          const offset = parseInt(urlObj.searchParams.get('offset') || '0', 10);
          const count = parseInt(urlObj.searchParams.get('count') || '0', 10);

          const page = rows.slice(offset, offset + count);
          return Promise.resolve({
            data: { results: page, fields: [{ name: '_time' }, { name: 'host' }, { name: '_raw' }] },
          });
        }
        // Job status
        return Promise.resolve({ data: { entry: [{ content: { isDone: true, dispatchState: 'DONE' } }] } });
      }
      return Promise.resolve({});
    });

    // We need to allow many rows
    (ds as any).jsonData.maxRows = rowCount + 1000;
    // Page size is capped at 5000 in code: Math.max(1, Math.min(this.jsonData.pageSize ?? 200, 5000));
    (ds as any).jsonData.pageSize = 5000;

    const start = performance.now();
    const result = await ds.query({
      targets: [{ refId: 'A', queryText: 'search index=main' }],
      range: { from: { toDate: () => new Date() }, to: { toDate: () => new Date() } } as any,
      scopedVars: {},
    } as any);
    const end = performance.now();

    console.log(`Query took: ${end - start}ms for ${rowCount} rows`);

    const frame = result.data[0];
    expect(frame.length).toBe(rowCount);
    expect(frame.fields[1].values.get(0)).toBe('host-0');
    expect(frame.fields[1].values.get(rowCount - 1)).toBe(`host-${rowCount - 1}`);
  });
});
