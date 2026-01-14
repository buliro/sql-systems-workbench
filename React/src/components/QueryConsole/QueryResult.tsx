import { useMemo } from 'react';

import { useAppContext } from '../../context/AppContext';
import './QueryResult.scss';

const MAX_RENDERED_ROWS = 250;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function QueryResult() {
  const { executionState } = useAppContext();
  const { result, isExecuting } = executionState;

  const rowsToRender = useMemo(() => {
    if (!result?.rows) return [] as Array<Record<string, unknown>>;
    return result.rows.slice(0, MAX_RENDERED_ROWS);
  }, [result]);

  const columns = useMemo(() => {
    if (!rowsToRender.length) return [] as string[];
    const unique = new Set<string>();
    rowsToRender.forEach((row) => {
      Object.keys(row).forEach((key) => unique.add(key));
    });
    return Array.from(unique);
  }, [rowsToRender]);

  if (isExecuting) {
    return (
      <div className="query-result query-result--status">
        <p>Executing query…</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="query-result query-result--status">
        <p>No query executed yet.</p>
      </div>
    );
  }

  return (
    <div className="query-result">
      <div className="query-result__meta">
        <span>Command: {result.command_tag}</span>
        <span>Rows: {result.rowcount}</span>
        <span>Duration: {result.meta.duration_ms.toFixed(2)} ms</span>
        <span>Type: {result.meta.query_type}</span>
        {result.meta.backend_pid && <span>Backend PID: {result.meta.backend_pid}</span>}
      </div>
      {rowsToRender.length === 0 ? (
        <div className="query-result__empty">No rows returned.</div>
      ) : (
        <div className="query-result__table-wrapper">
          <table className="query-result__table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsToRender.map((row, idx) => (
                <tr key={idx}>
                  {columns.map((column) => (
                    <td key={column}>
                      <span>{formatCell(row[column])}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.rows.length > MAX_RENDERED_ROWS && (
        <div className="query-result__footnote">
          Displaying first {MAX_RENDERED_ROWS} rows of {result.rows.length}.
        </div>
      )}
    </div>
  );
}

export default QueryResult;
