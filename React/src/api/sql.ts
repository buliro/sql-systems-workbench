import { request } from './client';
import type { SqlRequest, SqlResponse, SqlExecutionResult, SqlExecutionMeta } from '../types/sql';

export async function executeSql(payload: SqlRequest): Promise<SqlExecutionResult> {
  const response = await request<SqlResponse['data']>('/sql', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const meta = (response.meta as SqlExecutionMeta | undefined) ?? {
    duration_ms: 0,
    query_type: 'other',
  };

  return {
    rows: response.data.rows,
    rowcount: response.data.rowcount,
    command_tag: response.data.command_tag,
    meta,
  };
}
