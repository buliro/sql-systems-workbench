import { useState } from 'react';
import clsx from 'clsx';

import { useAppContext } from '../../context/AppContext';
import { executeSql } from '../../api/sql';
import type { ApiError } from '../../api/client';
import QueryResult from './QueryResult';
import './QueryConsole.scss';

function QueryConsole() {
  const {
    selectedSchema,
    markExecutionStart,
    markExecutionSuccess,
    markExecutionError,
    executionState,
  } = useAppContext();
  const [statement, setStatement] = useState('SELECT * FROM demo.accounts LIMIT 25;');
  const [parameters, setParameters] = useState('[]');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);

    let parsedParams: unknown = undefined;
    if (parameters.trim()) {
      try {
        parsedParams = JSON.parse(parameters);
      } catch (err) {
        setError('Parameters must be valid JSON.');
        return;
      }
    }

    markExecutionStart();
    try {
      const result = await executeSql({ statement, parameters: parsedParams });
      markExecutionSuccess(result);
    } catch (err) {
      const apiError = err as ApiError;
      markExecutionError({
        code: apiError.code ?? 'execution_error',
        message: apiError.message ?? 'Unknown execution error',
        sqlstate: apiError.sqlstate ?? null,
        details: apiError.details ?? null,
        hint: apiError.hint ?? null,
      });
    }
  };

  return (
    <section className="query-console">
      <header className="query-console__header">
        <div className="query-console__titles">
          <h2>SQL Console</h2>
          <span className="query-console__subtitle">
            Active schema: {selectedSchema ?? 'All schemas'}
          </span>
        </div>
        <button
          type="button"
          className={clsx('query-console__run', { 'query-console__run--loading': executionState.isExecuting })}
          onClick={onSubmit}
          disabled={executionState.isExecuting}
          aria-busy={executionState.isExecuting}
        >
          {executionState.isExecuting ? 'Running…' : 'Run Query'}
        </button>
      </header>
      <div className="query-console__editor">
        <div className="query-console__field">
          <label className="sr-only" htmlFor="sql-statement">
            SQL statement
          </label>
          <textarea
            id="sql-statement"
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            spellCheck={false}
            className="query-console__textarea"
            aria-label="SQL statement"
          />
          <span className="query-console__hint">Shift + Enter to add new line</span>
        </div>
        <div className="query-console__params">
          <label htmlFor="parameters">Parameters (JSON)</label>
          <textarea
            id="parameters"
            value={parameters}
            onChange={(event) => setParameters(event.target.value)}
            spellCheck={false}
            aria-describedby="parameters-hint"
          />
          <span id="parameters-hint" className="query-console__hint">
            Provide JSON array/object to bind values.
          </span>
        </div>
      </div>
      {error && (
        <p className="query-console__local-error" role="alert" aria-live="assertive">
          {error}
        </p>
      )}
      <QueryResult />
    </section>
  );
}

export default QueryConsole;
