export interface SqlExecutionMeta {
  duration_ms: number;
  query_type: string;
  backend_pid?: number;
}

export interface SqlExecutionResult {
  rows: Array<Record<string, unknown>>;
  rowcount: number;
  command_tag: string;
  meta: SqlExecutionMeta;
}

export interface SqlError {
  code: string;
  message: string;
  sqlstate?: string | null;
  details?: string | null;
  hint?: string | null;
}

export interface SqlResponse {
  status: 'ok';
  data: {
    rows: Array<Record<string, unknown>>;
    rowcount: number;
    command_tag: string;
  };
  meta: SqlExecutionMeta;
}

export interface SqlRequest {
  statement: string;
  parameters?: unknown;
}
