import React, { PureComponent, ChangeEvent } from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import {
  DataSourceHttpSettings,
  FieldSet,
  InlineField,
  InlineFieldRow,
  Input,
  Switch,
  TextArea,
  Button,
} from '@grafana/ui';
import { SplunkDataSourceOptions, SplunkSecureJsonData } from '../types';

type Props = DataSourcePluginOptionsEditorProps<SplunkDataSourceOptions>;

const DEFAULTS = {
  // Guardrails
  safeMode: true,
  maxRangeSeconds: 24 * 60 * 60,
  maxRows: 2000,
  pageSize: 200,
  pollIntervalMs: 1000,
  maxPolls: 30,
  requestTimeoutMs: 30000,

  // Commands
  overrideBannedCommands: false,
  bannedCommands: [
    'outputlookup',
    'sendemail',
    'rest',
    'delete',
    'collect',
    'sendalert',
    'runshellscript',
    'script',
    'mcollect',
    'loadjob',
    'map\\s+\\[',
  ].join('\n'),
  allowDangerousCommands: false,

  // Custom header default
  httpHeaderName1: 'Authorization',
};

export class ConfigEditor extends PureComponent<Props> {
  private update = (patch: Partial<SplunkDataSourceOptions>) => {
    const { options, onOptionsChange } = this.props;
    onOptionsChange({
      ...options,
      jsonData: { ...(options.jsonData as any), ...patch },
    });
  };

  private updateSecure = (patch: Partial<SplunkSecureJsonData>) => {
    const { options, onOptionsChange } = this.props;
    onOptionsChange({
      ...options,
      secureJsonData: { ...(options.secureJsonData as any), ...patch },
    });
  };

  private resetSecureFlags = (keys: Array<keyof SplunkSecureJsonData>) => {
    const { options, onOptionsChange } = this.props;
    const secureJsonFields = { ...(options.secureJsonFields as any) };
    for (const k of keys) {
      if (secureJsonFields && k in secureJsonFields) {
        delete secureJsonFields[k as any];
      }
    }
    onOptionsChange({
      ...options,
      secureJsonFields,
      secureJsonData: { ...(options.secureJsonData as any), ...keys.reduce((a, k) => ({ ...a, [k]: '' }), {}) },
    });
  };

  private onNumber =
    (key: keyof SplunkDataSourceOptions | keyof typeof DEFAULTS) => (e: ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.currentTarget.value);
      this.update({ [key as any]: Number.isFinite(v) && v >= 0 ? v : 0 } as any);
    };

  private onText =
    (key: keyof SplunkDataSourceOptions | keyof typeof DEFAULTS) => (e: ChangeEvent<HTMLInputElement>) => {
      this.update({ [key as any]: e.currentTarget.value } as any);
    };

  private onTextArea =
    (key: keyof SplunkDataSourceOptions | keyof typeof DEFAULTS) => (e: ChangeEvent<HTMLTextAreaElement>) => {
      this.update({ [key as any]: e.currentTarget.value } as any);
    };

  private onToggle = (key: keyof SplunkDataSourceOptions | keyof typeof DEFAULTS) => (v: boolean) => {
    this.update({ [key as any]: v } as any);
  };

  private resetBanned = () => {
    this.update({
      bannedCommands: DEFAULTS.bannedCommands,
      overrideBannedCommands: false,
    });
  };

  render() {
    const { options, onOptionsChange } = this.props;
    const jd = (options.jsonData as SplunkDataSourceOptions) || {};
    const sFields = (options.secureJsonFields as any) || {};
    const sData = (options.secureJsonData as SplunkSecureJsonData) || {};

    // Guardrails
    const safeMode = jd.safeMode ?? DEFAULTS.safeMode;
    const maxRangeSeconds = jd.maxRangeSeconds ?? DEFAULTS.maxRangeSeconds;
    const maxRows = jd.maxRows ?? DEFAULTS.maxRows;
    const pageSize = jd.pageSize ?? DEFAULTS.pageSize;
    const pollIntervalMs = jd.pollIntervalMs ?? DEFAULTS.pollIntervalMs;
    const maxPolls = jd.maxPolls ?? DEFAULTS.maxPolls;
    const requestTimeoutMs = jd.requestTimeoutMs ?? DEFAULTS.requestTimeoutMs;

    // Commands
    const overrideBannedCommands = jd.overrideBannedCommands ?? DEFAULTS.overrideBannedCommands;
    const bannedCommands = jd.bannedCommands ?? DEFAULTS.bannedCommands;
    const allowDangerousCommands = jd.allowDangerousCommands ?? DEFAULTS.allowDangerousCommands;

    // Custom header (token)
    const headerName = jd.httpHeaderName1 ?? DEFAULTS.httpHeaderName1;
    const headerConfigured = !!sFields.httpHeaderValue1;
    const headerValue = headerConfigured ? '********' : sData.httpHeaderValue1 ?? '';

    return (
      <div className="gf-form-group">
        {/* Use Grafana's built-in HTTP settings (URL, Basic auth, withCredentials, Custom headers) */}
        <FieldSet label="Connection">
          <DataSourceHttpSettings
            defaultUrl="https://localhost:8089"
            dataSourceConfig={options}
            onChange={onOptionsChange}
          />
        </FieldSet>

        {/* Optional: Custom Authorization (or any) header via Grafana proxy */}
        <FieldSet label="Custom Header (e.g., Bearer token)" style={{ marginTop: 16 }}>
          <InlineFieldRow>
            <InlineField label="Header name" tooltip='e.g., "Authorization"' grow>
              <Input width={40} value={headerName} onChange={this.onText('httpHeaderName1')} />
            </InlineField>
            <InlineField
              label="Header value"
              tooltip='e.g., "Bearer eyJ..." (stored securely; Grafana proxy injects it)'
              grow
            >
              <Input
                width={60}
                value={headerValue}
                placeholder={headerConfigured ? 'configured' : 'Bearer <token>'}
                onChange={(e) => this.updateSecure({ httpHeaderValue1: e.currentTarget.value })}
                disabled={headerConfigured}
              />
            </InlineField>
          </InlineFieldRow>

          {headerConfigured && (
            <Button variant="secondary" onClick={() => this.resetSecureFlags(['httpHeaderValue1'])}>
              Reset saved header value
            </Button>
          )}
        </FieldSet>

        {/* Guardrails */}
        <FieldSet label="Guardrails" style={{ marginTop: 16 }}>
          <InlineFieldRow>
            <InlineField label="Safe mode" tooltip="Apply conservative safety checks to protect Splunk." grow>
              <Switch value={safeMode} onChange={(e) => this.onToggle('safeMode')(e.currentTarget.checked)} />
            </InlineField>

            <InlineField label="Max time range (s)" tooltip="Hard cap for query time range." grow>
              <Input type="number" value={maxRangeSeconds} min={0} onChange={this.onNumber('maxRangeSeconds')} />
            </InlineField>

            <InlineField label="Max rows" tooltip="Cap on total rows returned per query." grow>
              <Input type="number" value={maxRows} min={0} onChange={this.onNumber('maxRows')} />
            </InlineField>

            <InlineField label="Page size" tooltip="Rows per page when fetching results from Splunk." grow>
              <Input type="number" value={pageSize} min={1} onChange={this.onNumber('pageSize')} />
            </InlineField>
          </InlineFieldRow>

          <InlineFieldRow>
            <InlineField label="Poll interval (ms)" tooltip="Interval between job status checks." grow>
              <Input type="number" value={pollIntervalMs} min={100} onChange={this.onNumber('pollIntervalMs')} />
            </InlineField>

            <InlineField label="Max polls" tooltip="Maximum number of status polls before giving up." grow>
              <Input type="number" value={maxPolls} min={1} onChange={this.onNumber('maxPolls')} />
            </InlineField>

            <InlineField label="Request timeout (ms)" tooltip="Bound single HTTP call (best effort)." grow>
              <Input type="number" value={requestTimeoutMs} min={0} onChange={this.onNumber('requestTimeoutMs')} />
            </InlineField>
          </InlineFieldRow>
        </FieldSet>

        {/* Command Controls */}
        <FieldSet label="Command Controls" style={{ marginTop: 16 }}>
          <InlineFieldRow>
            <InlineField label="Allow dangerous commands" tooltip="Disable deny‑list checks (NOT RECOMMENDED)." grow>
              <Switch
                value={allowDangerousCommands}
                onChange={(e) => this.onToggle('allowDangerousCommands')(e.currentTarget.checked)}
              />
            </InlineField>
            <InlineField
              label="Override banned list"
              tooltip="Use a custom list of banned commands (one per line, regex supported)."
              grow
            >
              <Switch
                value={overrideBannedCommands}
                onChange={(e) => this.onToggle('overrideBannedCommands')(e.currentTarget.checked)}
              />
            </InlineField>
          </InlineFieldRow>

          <InlineFieldRow>
            <InlineField
              label="Banned commands"
              tooltip="Each line is a regex fragment with word boundaries. Example: outputlookup"
              grow
            >
              <TextArea
                value={bannedCommands}
                rows={6}
                onChange={this.onTextArea('bannedCommands')}
                placeholder={DEFAULTS.bannedCommands}
              />
            </InlineField>
          </InlineFieldRow>

          <Button variant="secondary" onClick={this.resetBanned}>
            Reset banned list to defaults
          </Button>
        </FieldSet>
      </div>
    );
  }
}
