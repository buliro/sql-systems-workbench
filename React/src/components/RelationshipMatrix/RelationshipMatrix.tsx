import { useMemo } from 'react';
import { useQueries, UseQueryResult } from '@tanstack/react-query';

import { useAppContext } from '../../context/AppContext';
import { useTables } from '../../hooks/useMetadata';
import { fetchConstraints } from '../../api/metadata';
import type { ConstraintDefinition } from '../../types/metadata';
import './RelationshipMatrix.scss';

interface RelationshipEdge {
  source: string;
  sourceSchema: string;
  target: string;
  targetSchema: string;
  columns: string;
  definition: string;
}

function extractTarget(definition: string, fallbackSchema: string): { schema: string; table: string } {
  const match = definition.match(/REFERENCES\s+([^\s(]+)/i);
  if (!match) {
    return { schema: fallbackSchema, table: definition };
  }
  const ref = match[1].replace(/"/g, '');
  if (ref.includes('.')) {
    const [schema, table] = ref.split('.', 2);
    return { schema, table };
  }
  return { schema: fallbackSchema, table: ref };
}

function RelationshipMatrix() {
  const { selectedSchema } = useAppContext();
  const { data: tables, isLoading: tablesLoading } = useTables(selectedSchema ?? undefined);

  const constraintQueries = useQueries({
    queries: (tables ?? []).map((table) => ({
      queryKey: ['relationships', table.schema_name, table.table_name],
      queryFn: () => fetchConstraints(table.schema_name, table.table_name),
      enabled: Boolean(selectedSchema),
    })),
  }) as UseQueryResult<ConstraintDefinition[], unknown>[];

  const edges: RelationshipEdge[] = useMemo(() => {
    const result: RelationshipEdge[] = [];
    constraintQueries.forEach((query, idx) => {
      const table = tables?.[idx];
      if (!table || !query.data) return;
      query.data
        .filter((c) => c.constraint_type === 'FOREIGN_KEY')
        .forEach((constraint) => {
          const target = extractTarget(constraint.definition_json.definition, table.schema_name);
          result.push({
            source: table.table_name,
            sourceSchema: table.schema_name,
            target: target.table,
            targetSchema: target.schema,
            columns: constraint.definition_json.definition,
            definition: constraint.definition_json.definition,
          });
        });
    });
    return result;
  }, [constraintQueries, tables]);

  const isLoading = tablesLoading || constraintQueries.some((q) => q.isLoading);

  if (!selectedSchema) {
    return (
      <section className="relationship-matrix relationship-matrix--empty">
        <p>Select a schema to view foreign key relationships.</p>
      </section>
    );
  }

  return (
    <section className="relationship-matrix">
      <header className="relationship-matrix__header">
        <div>
          <h2>Relationships</h2>
          <p>Foreign key edges for schema {selectedSchema}</p>
        </div>
      </header>
      {isLoading && <p className="relationship-matrix__status">Loading relationships…</p>}
      {!isLoading && edges.length === 0 && (
        <p className="relationship-matrix__status">No foreign keys detected.</p>
      )}
      {!isLoading && edges.length > 0 && (
        <div className="relationship-matrix__table-wrapper">
          <table className="relationship-matrix__table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Target</th>
                <th>Definition</th>
              </tr>
            </thead>
            <tbody>
              {edges.map((edge, idx) => (
                <tr key={`${edge.source}->${edge.target}-${idx}`}>
                  <td>
                    <strong>{edge.sourceSchema}.{edge.source}</strong>
                  </td>
                  <td>
                    <strong>{edge.targetSchema}.{edge.target}</strong>
                  </td>
                  <td>
                    <code>{edge.definition}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default RelationshipMatrix;
