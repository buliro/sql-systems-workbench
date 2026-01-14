import { ReactNode } from 'react';

import './Layout.scss';

interface LayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
}

function Layout({ sidebar, main }: LayoutProps) {
  return (
    <div className="layout">
      <a className="layout__skip" href="#main-content">
        Skip to main content
      </a>
      <header className="layout__header">
        <div className="layout__brand">
          <span className="layout__title">SQL Systems Workbench</span>
          <span className="layout__subtitle">Relational dashboard</span>
        </div>
      </header>
      <div className="layout__body">
        <aside className="layout__sidebar">{sidebar}</aside>
        <main id="main-content" className="layout__content">
          {main}
        </main>
      </div>
    </div>
  );
}

export default Layout;
