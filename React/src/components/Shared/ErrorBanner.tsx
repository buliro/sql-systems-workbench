import './ErrorBanner.scss';

import type { SqlError } from '../../types/sql';

interface ErrorBannerProps {
  error: SqlError;
  onDismiss(): void;
}

function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  return (
    <div className="error-banner" role="alert">
      <div className="error-banner__details">
        <span className="error-banner__code">{error.code}</span>
        <span className="error-banner__message">{error.message}</span>
        {error.sqlstate && (
          <span className="error-banner__meta">SQLSTATE {error.sqlstate}</span>
        )}
        {error.details && <span className="error-banner__meta">{error.details}</span>}
        {error.hint && <span className="error-banner__meta">Hint: {error.hint}</span>}
      </div>
      <button type="button" className="error-banner__close" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

export default ErrorBanner;
