import { createContext, useContext, useMemo, useReducer, ReactNode } from 'react';

import type { SqlError, SqlExecutionResult } from '../types/sql';

export interface SelectedTable {
  schema: string;
  table: string;
}

interface ExecutionState {
  result: SqlExecutionResult | null;
  error: SqlError | null;
  isExecuting: boolean;
}

interface AppState {
  selectedSchema: string | null;
  selectedTable: SelectedTable | null;
  executionState: ExecutionState;
}

type Action =
  | { type: 'SET_SCHEMA'; schema: string | null }
  | { type: 'SET_TABLE'; table: SelectedTable | null }
  | { type: 'EXECUTE_START' }
  | { type: 'EXECUTE_SUCCESS'; result: SqlExecutionResult }
  | { type: 'EXECUTE_ERROR'; error: SqlError }
  | { type: 'CLEAR_ERROR' };

interface AppContextValue extends AppState {
  setSelectedSchema(schema: string | null): void;
  setSelectedTable(table: SelectedTable | null): void;
  markExecutionStart(): void;
  markExecutionSuccess(result: SqlExecutionResult): void;
  markExecutionError(error: SqlError): void;
  clearExecutionError(): void;
}

const initialState: AppState = {
  selectedSchema: null,
  selectedTable: null,
  executionState: {
    result: null,
    error: null,
    isExecuting: false,
  },
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SCHEMA':
      return {
        ...state,
        selectedSchema: action.schema,
        selectedTable:
          action.schema && state.selectedTable?.schema === action.schema
            ? state.selectedTable
            : null,
      };
    case 'SET_TABLE':
      return {
        ...state,
        selectedTable: action.table,
        selectedSchema: action.table?.schema ?? state.selectedSchema,
      };
    case 'EXECUTE_START':
      return {
        ...state,
        executionState: { result: null, error: null, isExecuting: true },
      };
    case 'EXECUTE_SUCCESS':
      return {
        ...state,
        executionState: { result: action.result, error: null, isExecuting: false },
      };
    case 'EXECUTE_ERROR':
      return {
        ...state,
        executionState: { result: null, error: action.error, isExecuting: false },
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        executionState: { ...state.executionState, error: null },
      };
    default:
      return state;
  }
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      setSelectedSchema: (schema: string | null) => dispatch({ type: 'SET_SCHEMA', schema }),
      setSelectedTable: (table: SelectedTable | null) => dispatch({ type: 'SET_TABLE', table }),
      markExecutionStart: () => dispatch({ type: 'EXECUTE_START' }),
      markExecutionSuccess: (result: SqlExecutionResult) =>
        dispatch({ type: 'EXECUTE_SUCCESS', result }),
      markExecutionError: (error: SqlError) => dispatch({ type: 'EXECUTE_ERROR', error }),
      clearExecutionError: () => dispatch({ type: 'CLEAR_ERROR' }),
    }),
    [state],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return ctx;
}
