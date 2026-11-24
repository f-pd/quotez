import { Outlet } from '@tanstack/solid-router';

export function PublicLayout() {
  return (
    <div data-testid="public-layout" style={{ 'min-height': '100vh', display: 'flex', 'flex-direction': 'column' }}>
      <main style={{ flex: 1, display: 'flex', 'flex-direction': 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
