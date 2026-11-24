import { Show, createSignal } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import { verifyCredentials, setCredentials } from '../lib/auth';

const fieldStyle = {
  padding: 'var(--spacing-sm)',
  'border-radius': 'var(--radius)',
  border: '1px solid var(--color-border)',
  'background-color': 'var(--color-bg)',
  color: 'var(--color-text)',
  'font-family': 'inherit',
};

const rowStyle = { display: 'flex', 'flex-direction': 'column', gap: 'var(--spacing-sm)' } as const;

export function LoginPage() {
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const isValid = await verifyCredentials(username(), password());
      if (isValid) {
        setCredentials(username(), password());
        navigate({ to: '/admin' });
      } else {
        setError('Invalid credentials');
      }
    } catch {
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        'justify-content': 'center',
        'align-items': 'center',
        'min-height': '100vh',
        'background-color': 'var(--color-bg)',
      }}
    >
      <form
        data-testid="login-form"
        onSubmit={handleSubmit}
        style={{
          'background-color': 'var(--color-surface)',
          padding: 'var(--spacing-xl)',
          'border-radius': 'var(--radius)',
          border: '1px solid var(--color-border)',
          width: '100%',
          'max-width': '400px',
          display: 'flex',
          'flex-direction': 'column',
          gap: 'var(--spacing-md)',
        }}
      >
        <h1 style={{ 'text-align': 'center', 'margin-bottom': 'var(--spacing-md)' }}>Admin Login</h1>

        <Show when={error()}>
          <div
            style={{
              color: '#ff6b6b',
              'background-color': 'rgba(255, 107, 107, 0.1)',
              padding: 'var(--spacing-sm)',
              'border-radius': 'var(--radius)',
              'text-align': 'center',
            }}
          >
            {error()}
          </div>
        </Show>

        <div style={rowStyle}>
          <label for="username" style={{ color: 'var(--color-text-muted)' }}>
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username()}
            onInput={(e) => setUsername(e.currentTarget.value)}
            required
            style={fieldStyle}
          />
        </div>

        <div style={rowStyle}>
          <label for="password" style={{ color: 'var(--color-text-muted)' }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            required
            style={fieldStyle}
          />
        </div>

        <button
          data-testid="login-submit"
          type="submit"
          disabled={loading()}
          style={{
            'margin-top': 'var(--spacing-md)',
            padding: 'var(--spacing-md)',
            'background-color': 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            'border-radius': 'var(--radius)',
            cursor: loading() ? 'not-allowed' : 'pointer',
            'font-weight': 'bold',
            opacity: loading() ? 0.7 : 1,
            transition: 'background-color var(--transition)',
          }}
        >
          {loading() ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}
