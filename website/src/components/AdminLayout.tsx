import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { clearCredentials } from '../lib/auth';
import { fetchStatus, type Status } from '../lib/api';
import '../styles/admin.css';

export function AdminLayout() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);

  // Keep the mode indicators in the sidebar fresh on every page
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchStatus()
        .then((s) => alive && setStatus(s))
        .catch(() => alive && setStatus(null));
    load();
    const t = setInterval(load, 10000);
    window.addEventListener('quotez:modes-changed', load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('quotez:modes-changed', load);
    };
  }, []);

  const handleLogout = () => {
    clearCredentials();
    navigate({ to: '/admin/login' });
  };

  return (
    <div data-testid="admin-layout" className="admin-shell">
      <aside data-testid="admin-nav" className="admin-nav">
        <div className="brand">quotez admin</div>
        <nav>
          <Link to="/admin" activeProps={{ className: 'active' }} activeOptions={{ exact: true }}>
            Dashboard
          </Link>
          <Link to="/admin/quotes" activeProps={{ className: 'active' }}>
            Quotes
          </Link>
          <Link to="/admin/logs" activeProps={{ className: 'active' }}>
            Logs
          </Link>
          <Link to="/admin/config" activeProps={{ className: 'active' }}>
            Config
          </Link>
        </nav>
        {status && (
          <div className="mode-pills">
            {status.maintenance ? <span className="pill warn">maintenance</span> : <span className="pill ok">live</span>}
            {status.debug && <span className="pill info">debug</span>}
          </div>
        )}
        <div className="logout" style={{ marginTop: 'auto' }}>
          <button className="btn sm" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

/** Notify the layout that maintenance/debug changed so the sidebar updates at once. */
export function notifyModesChanged() {
  window.dispatchEvent(new Event('quotez:modes-changed'));
}
