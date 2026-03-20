import defaults from 'lodash/defaults';
import debounce from 'lodash/debounce';
import React, { PureComponent } from 'react';
import { Button, InlineField, InlineFieldRow, Icon, Alert, HorizontalGroup, LinkButton, TextArea } from '@grafana/ui';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
import { defaultQuery, SplunkDataSourceOptions, SplunkQuery } from '../types';

type Props = QueryEditorProps<DataSource, SplunkQuery, SplunkDataSourceOptions>;
type State = {
  text: string;
  validationMsg: string | null;
  isDangerous: boolean;
};

const BANNED_COMMANDS = [
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
];
const bannedRegex = new RegExp(`\\b(${BANNED_COMMANDS.join('|')})\\b`, 'i');

const MIN_QUERY_LENGTH = 1;

export class QueryEditor extends PureComponent<Props, State> {
  state: State = {
    text: '',
    validationMsg: null,
    isDangerous: false,
  };

  constructor(props: Props) {
    super(props);
    const initial = defaults(props.query, defaultQuery).queryText ?? '';
    const { validationMsg, isDangerous } = this.validate(initial);
    this.state = { text: initial, validationMsg, isDangerous };
  }

  private debouncedPropagate = debounce((value: string) => {
    const { onChange, query } = this.props;
    onChange({ ...query, queryText: value });
  }, 150);

  private validate = (value: string): { validationMsg: string | null; isDangerous: boolean } => {
    const v = value?.trim() ?? '';
    if (v.length < MIN_QUERY_LENGTH) {
      return { validationMsg: 'Query is empty.', isDangerous: false };
    }
    if (bannedRegex.test(v)) {
      return {
        validationMsg:
          'This query includes a risky Splunk command (e.g., sendemail, outputlookup, rest, delete, collect, script, map[]). It will be blocked.',
        isDangerous: true,
      };
    }
    return { validationMsg: null, isDangerous: false };
  };

  private setText = (value: string) => {
    const { validationMsg, isDangerous } = this.validate(value);
    this.setState({ text: value, validationMsg, isDangerous });
    this.debouncedPropagate(value);
  };

  private runIfSafe = () => {
    const { onRunQuery } = this.props;
    const { isDangerous, validationMsg } = this.state;
    if (isDangerous || validationMsg) {
      return;
    }
    onRunQuery();
  };

  private handleBlur = () => {
    this.runIfSafe();
  };

  private clear = () => {
    this.setText('');
    this.debouncedPropagate.flush?.();
    this.props.onRunQuery();
  };

  render() {
    const { text, validationMsg, isDangerous } = this.state;

    return (
      <div className="gf-form" style={{ width: '100%' }}>
        <InlineFieldRow>
          <InlineField label="SPL" grow>
            <TextArea
              name="queryText"
              value={text}
              rows={6}
              placeholder="e.g. index=main sourcetype=syslog host=$host | stats count by host"
              onChange={(e) => this.setText(e.currentTarget.value)}
              onBlur={this.handleBlur}
            />
          </InlineField>
        </InlineFieldRow>

        <div style={{ marginTop: 8 }}>
          <HorizontalGroup spacing="sm">
            <Button icon="play" onClick={this.runIfSafe} disabled={!!validationMsg || isDangerous}>
              Run
            </Button>
            <Button variant="secondary" icon="trash-alt" onClick={this.clear}>
              Clear
            </Button>
            <LinkButton
              icon="book"
              href="https://docs.splunk.com/Documentation/Splunk/latest/SearchReference/WhatsInThisManual"
              target="_blank"
              variant="secondary"
            >
              SPL Docs
            </LinkButton>
            {validationMsg ? (
              <Alert title="Validation" severity={isDangerous ? 'error' : 'warning'} style={{ marginLeft: 8 }}>
                <HorizontalGroup spacing="xs">
                  <Icon name={isDangerous ? 'exclamation-triangle' : 'exclamation-circle'} />
                  <span>{validationMsg}</span>
                </HorizontalGroup>
              </Alert>
            ) : null}
          </HorizontalGroup>
        </div>
      </div>
    );
  }
}
