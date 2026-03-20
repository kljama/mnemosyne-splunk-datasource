import { DataSourcePlugin } from '@grafana/data';
import { DataSource } from './datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { VariableQueryEditor } from './components/VariableQueryEditor';
import type { SplunkQuery, SplunkDataSourceOptions, SplunkSecureJsonData } from './types';

// Keep the same editors; just ensure the generic parameters align with your DataSource
export const plugin = new DataSourcePlugin<DataSource, SplunkQuery, SplunkDataSourceOptions, SplunkSecureJsonData>(
  DataSource
)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor)
  .setVariableQueryEditor(VariableQueryEditor);
