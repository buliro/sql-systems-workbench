import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

import { useTables } from '../../hooks/useMetadata';
import type { SelectedTable } from '../../context/AppContext';
import type { TableSummary } from '../../types/metadata';
import './SchemaExplorer.scss';

interface SchemaExplorerProps {
  selectedSchema: string | null;
  selectedTable: SelectedTable | null;
  onSelectSchema(schema: string | null): void;
  onSelectTable(schema: string, table: string): void;
}

function SchemaExplorer({
  selectedSchema,
  selectedTable,
  onSelectSchema,
  onSelectTable,
}: SchemaExplorerProps) {
  const { data: tables, isLoading } = useTables();
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    if (!tables) return new Map<string, TableSummary[]>();
    return tables.reduce((acc, table) => {
      const list = acc.get(table.schema_name) ?? [];
      list.push(table);
      acc.set(table.schema_name, list);
      return acc;
    }, new Map<string, TableSummary[]>());
  }, [tables]);

  const formatRowCount = (count: number | string | null | undefined) => {
    if (count == null) {
      return '—';
    }
    const numeric = typeof count === 'number' ? count : Number(count);
    if (!Number.isFinite(numeric)) {
      return '—';
    }
    if (numeric < 0) return '0 rows';
    if (numeric === 1) return '1 row';
    return `${numeric.toLocaleString()} rows`;
  };

  const toggleSchema = (schema: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      const wasExpanded = next.has(schema);
      if (wasExpanded) {
        next.delete(schema);
        if (selectedSchema === schema) {
          onSelectSchema(null);
        }
      } else {
        next.add(schema);
        onSelectSchema(schema);
      }
      return next;
    });
  };

  useEffect(() => {
    if (selectedSchema) {
      setExpandedSchemas((prev) => {
        if (prev.has(selectedSchema)) return prev;
        const next = new Set(prev);
        next.add(selectedSchema);
        return next;
      });
    }
  }, [selectedSchema]);

  return (
    <div className="schema-explorer">
      <div className="schema-explorer__header">
        <h2>Schemas</h2>
      </div>
      {isLoading && <p className="schema-explorer__status">Loading schemas…</p>}
      {!isLoading && grouped.size === 0 && (
        <p className="schema-explorer__status">No schemas detected.</p>
      )}
      <ul className="schema-explorer__list">
        {[...grouped.entries()].map(([schema, tableItems]) => {
          const isExpanded = expandedSchemas.has(schema) || schema === selectedSchema;
          return (
            <li key={schema} className="schema-explorer__item">
              <button
                type="button"
                className={clsx('schema-explorer__schema', {
                  'schema-explorer__schema--active': schema === selectedSchema,
                })}
                onClick={() => toggleSchema(schema)}
              >
                <span className="schema-explorer__schema-name">{schema}</span>
                <span className="schema-explorer__schema-count">{tableItems.length} tables</span>
              </button>
              {isExpanded && (
                <ul className="schema-explorer__tables">
                  {tableItems.map((table) => {
                    const active =
                      selectedTable?.schema === schema && selectedTable?.table === table.table_name;
                    return (
                      <li key={table.table_name}>
                        <button
                          type="button"
                          className={clsx('schema-explorer__table', {
                            'schema-explorer__table--active': active,
                          })}
                          onClick={() => onSelectTable(schema, table.table_name)}
                        >
                          <span className="schema-explorer__table-name">{table.table_name}</span>
                          <span className="schema-explorer__table-count">
                            {formatRowCount(table.row_estimate)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default SchemaExplorer;
