import { useMemo } from 'react';

import { useAppContext } from './context/AppContext';
import Layout from './components/Layout/Layout';
import SchemaExplorer from './components/SchemaExplorer/SchemaExplorer';
import QueryConsole from './components/QueryConsole/QueryConsole';
import TableDetails from './components/TableDetails/TableDetails';
import RelationshipMatrix from './components/RelationshipMatrix/RelationshipMatrix';
import ErrorBanner from './components/Shared/ErrorBanner';

function App() {
  const {
    selectedSchema,
    selectedTable,
    executionState,
    setSelectedSchema,
    setSelectedTable,
    clearExecutionError,
  } = useAppContext();

  const activeError = useMemo(() => executionState.error, [executionState.error]);

  return (
    <Layout
      sidebar={
        <SchemaExplorer
          selectedSchema={selectedSchema}
          selectedTable={selectedTable}
          onSelectSchema={setSelectedSchema}
          onSelectTable={(schema: string, table: string) => setSelectedTable({ schema, table })}
        />
      }
      main={
        <div className="app__main">
          {activeError && (
            <ErrorBanner error={activeError} onDismiss={clearExecutionError} />
          )}
          <div className="app__panels">
            <QueryConsole />
            <TableDetails />
            <RelationshipMatrix />
          </div>
        </div>
      }
    />
  );
}

export default App;
