import { Show, createSignal, onCleanup } from 'solid-js';
import { Link, Outlet, useNavigate } from '@tanstack/solid-router';
import { clearCredentials } from '../lib/auth';
import { fetchStatus, type Status } from '../lib/api';
import '../styles/admin.css';

export function AdminLayout() {
  const navigate = useNavigate();
  const [status, setStatus] = createSignal<Status | null>(null);

  // Keep the mode indicators in the sidebar fresh on every page
  let alive = true;
  const load = () =>
    fetchStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus(null));
  load();
  const t = setInterval(load, 10000);
  window.addEventListener('quotez:modes-changed', load);
  onCleanup(() => {
    alive = false;
    clearInterval(t);
    window.removeEventListener('quotez:modes-changed', load);
  });

  const handleLogout = () => {
    clearCredentials();
    navigate({ to: '/admin/login' });
  };

  return (
    <div data-testid="admin-layout" class="admin-shell">
      <aside data-testid="admin-nav" class="admin-nav">
        <div class="brand">quotez admin</div>
        <nav>
          <Link to="/admin" activeProps={{ class: 'active' }} activeOptions={{ exact: true }}>
            Dashboard
          </Link>
          <Link to="/admin/quotes" activeProps={{ class: 'active' }}>
            Quotes
          </Link>
          <Link to="/admin/logs" activeProps={{ class: 'active' }}>
            Logs
          </Link>
          <Link to="/admin/config" activeProps={{ class: 'active' }}>
            Config
          </Link>
        </nav>
        <Show when={status()}>
          {(s) => (
            <div class="mode-pills">
              {s().maintenance ? <span class="pill warn">maintenance</span> : <span class="pill ok">live</span>}
              <Show when={s().debug}>
                <span class="pill info">debug</span>
              </Show>
            </div>
          )}
        </Show>
        <div class="logout" style={{ 'margin-top': 'auto' }}>
          <button class="btn sm" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>
      <main class="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

/** Notify the layout that maintenance/debug changed so the sidebar updates at once. */
export function notifyModesChanged() {
  window.dispatchEvent(new Event('quotez:modes-changed'));
}
