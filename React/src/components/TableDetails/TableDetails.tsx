import clsx from 'clsx';

import { useAppContext } from '../../context/AppContext';
import { useTableDetails } from '../../hooks/useMetadata';
import './TableDetails.scss';

function TableDetails() {
  const { selectedTable } = useAppContext();
  const schema = selectedTable?.schema ?? null;
  const table = selectedTable?.table ?? null;

  const { columns, constraints, indexes } = useTableDetails(schema, table);

  if (!schema || !table) {
    return (
      <section className="table-details table-details--empty">
        <p>Select a table to view structural details.</p>
      </section>
    );
  }

  const isLoading = columns.isLoading || constraints.isLoading || indexes.isLoading;

  return (
    <section className="table-details">
      <header className="table-details__header">
        <div>
          <h2>{schema}.{table}</h2>
          <p>Columns, constraints, and indexes as reported by PostgreSQL catalog.</p>
        </div>
      </header>

      {isLoading && <p className="table-details__status">Loading metadata…</p>}

      {!isLoading && (
        <div className="table-details__grid">
          <div className="table-details__panel">
            <h3>Columns</h3>
            {columns.data && columns.data.length > 0 ? (
              <div className="table-details__table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Nullable</th>
                      <th>Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.data.map((col) => (
                      <tr key={col.column_name}>
                        <td>{col.column_name}</td>
                        <td>{col.data_type}</td>
                        <td>{col.is_nullable ? 'YES' : 'NO'}</td>
                        <td>{col.default_expr ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="table-details__empty">No columns found.</p>
            )}
          </div>

          <div className="table-details__panel">
            <h3>Constraints</h3>
            {constraints.data && constraints.data.length > 0 ? (
              <ul className="table-details__list">
                {constraints.data.map((constraint) => (
                  <li key={constraint.definition_json.name}>
                    <span className={clsx('badge', `badge--${constraint.constraint_type.toLowerCase()}`)}>
                      {constraint.constraint_type}
                    </span>
                    <span>{constraint.definition_json.definition}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="table-details__empty">No constraints.</p>
            )}
          </div>

          <div className="table-details__panel">
            <h3>Indexes</h3>
            {indexes.data && indexes.data.length > 0 ? (
              <ul className="table-details__list">
                {indexes.data.map((index) => (
                  <li key={index.index_name}>
                    <span className="badge">{index.index_type}</span>
                    <span>{index.index_name}</span>
                    <span className="table-details__muted">
                      {index.uniqueness ? 'UNIQUE' : 'NON-UNIQUE'} • {index.columns.columns.join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="table-details__empty">No indexes.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default TableDetails;
