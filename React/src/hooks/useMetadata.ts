import { useQuery, useQueries, UseQueryResult } from '@tanstack/react-query';

import { fetchTables, fetchColumns, fetchConstraints, fetchIndexes } from '../api/metadata';
import type {
  TableSummary,
  ColumnDefinition,
  ConstraintDefinition,
  IndexDefinition,
} from '../types/metadata';

const METADATA_KEYS = {
  tables: (schema?: string) => ['metadata', 'tables', schema ?? 'all'] as const,
  tableColumns: (schema: string, table: string) => ['metadata', schema, table, 'columns'] as const,
  tableConstraints: (schema: string, table: string) => ['metadata', schema, table, 'constraints'] as const,
  tableIndexes: (schema: string, table: string) => ['metadata', schema, table, 'indexes'] as const,
};

export function useTables(schema?: string) {
  return useQuery<TableSummary[]>({
    queryKey: METADATA_KEYS.tables(schema),
    queryFn: () => fetchTables(schema),
  });
}

export function useTableDetails(schema?: string | null, table?: string | null) {
  const enabled = Boolean(schema && table);
  const keys = schema && table ? { schema, table } : undefined;

  const results = useQueries({
    queries: [
      {
        queryKey: keys ? METADATA_KEYS.tableColumns(keys.schema, keys.table) : ['disabled', 'columns'],
        queryFn: () => fetchColumns(keys!.schema, keys!.table),
        enabled,
      },
      {
        queryKey: keys
          ? METADATA_KEYS.tableConstraints(keys.schema, keys.table)
          : ['disabled', 'constraints'],
        queryFn: () => fetchConstraints(keys!.schema, keys!.table),
        enabled,
      },
      {
        queryKey: keys ? METADATA_KEYS.tableIndexes(keys.schema, keys.table) : ['disabled', 'indexes'],
        queryFn: () => fetchIndexes(keys!.schema, keys!.table),
        enabled,
      },
    ],
  }) as [
    UseQueryResult<ColumnDefinition[]>,
    UseQueryResult<ConstraintDefinition[]>,
    UseQueryResult<IndexDefinition[]>,
  ];

  return {
    columns: results[0],
    constraints: results[1],
    indexes: results[2],
  };
}
