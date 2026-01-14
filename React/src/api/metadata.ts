import { request } from './client';
import type {
  TableSummary,
  ColumnDefinition,
  ConstraintDefinition,
  IndexDefinition,
} from '../types/metadata';

export async function fetchTables(schema?: string) {
  const search = schema ? `?schema=${encodeURIComponent(schema)}` : '';
  const response = await request<{ tables: TableSummary[] }>(`/metadata/tables${search}`);
  return response.data.tables;
}

export async function fetchColumns(schema: string, table: string) {
  const response = await request<{ columns: ColumnDefinition[] }>(
    `/metadata/tables/${schema}/${table}/columns`,
  );
  return response.data.columns;
}

export async function fetchConstraints(schema: string, table: string) {
  const response = await request<{ constraints: ConstraintDefinition[] }>(
    `/metadata/tables/${schema}/${table}/constraints`,
  );
  return response.data.constraints;
}

export async function fetchIndexes(schema: string, table: string) {
  const response = await request<{ indexes: IndexDefinition[] }>(
    `/metadata/tables/${schema}/${table}/indexes`,
  );
  return response.data.indexes;
}
