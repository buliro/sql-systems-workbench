export interface TableSummary {
  schema_name: string;
  table_name: string;
  owner_role: string;
  created_at: string;
  row_estimate: number | null;
}

export interface ColumnDefinition {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  default_expr: string | null;
  ordinal_position: number;
}

export interface ConstraintDefinition {
  constraint_type: string;
  definition_json: {
    name: string;
    definition: string;
  };
  created_at: string;
}

export interface IndexDefinition {
  index_name: string;
  index_type: string;
  columns: {
    columns: string[];
    definition: string;
  };
  uniqueness: boolean;
  created_at: string;
}
