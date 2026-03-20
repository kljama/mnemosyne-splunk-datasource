import React, { useState, useMemo } from 'react';
import debounce from 'lodash/debounce';
import { TextArea, Button, InlineField, InlineFieldRow, Alert, HorizontalGroup, LinkButton, Icon } from '@grafana/ui';
import { SplunkQuery } from '../types';

type VariableQueryProps = {
  query: SplunkQuery;
  onChange: (query: SplunkQuery, definition: string) => void;
  onRunQuery?: () => void;
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

export const VariableQueryEditor = ({ onChange, query, onRunQuery }: VariableQueryProps) => {
  const [text, setText] = useState<string>(query.queryText ?? '');
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [isDangerous, setIsDangerous] = useState<boolean>(false);

  const validate = (value: string) => {
    const v = value?.trim() ?? '';
    if (v.length < MIN_QUERY_LENGTH) {
      setValidationMsg('Query is empty.');
      setIsDangerous(false);
      return;
    }
    if (bannedRegex.test(v)) {
      setValidationMsg(
        'This query includes a risky Splunk command (e.g., sendemail, outputlookup, rest, delete, collect, script, map[]). It will be blocked.'
      );
      setIsDangerous(true);
      return;
    }
    setValidationMsg(null);
    setIsDangerous(false);
  };

  // Debounce saving changes back to Grafana model
  const debouncedSave = useMemo(
    () =>
      debounce((value: string) => {
        onChange({ ...query, queryText: value }, value);
      }, 150),
    [onChange, query]
  );

  const handleChange = (event: React.FormEvent<HTMLTextAreaElement>) => {
    const value = event.currentTarget.value;
    setText(value);
    validate(value);
    debouncedSave(value);
  };

  const runIfSafe = () => {
    if (!validationMsg && !isDangerous) {
      onRunQuery?.();
    }
  };

  const clear = () => {
    setText('');
    validate('');
    debouncedSave.flush?.();
    onChange({ ...query, queryText: '' }, '');
    onRunQuery?.();
  };

  return (
    <div className="gf-form" style={{ width: '100%' }}>
      <InlineFieldRow>
        <InlineField label="SPL (variable)" grow>
          <TextArea name="queryText" onChange={handleChange} value={text} rows={5} />
        </InlineField>
      </InlineFieldRow>

      <div style={{ marginTop: 8 }}>
        <HorizontalGroup spacing="sm">
          <Button icon="play" onClick={runIfSafe} disabled={!!validationMsg || isDangerous}>
            Run
          </Button>
          <Button variant="secondary" icon="trash-alt" onClick={clear}>
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
};
