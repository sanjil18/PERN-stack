import { useState } from 'react';

const AuthPanel = ({ error, status, busy, onLogin, onRegister }) => {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [localError, setLocalError] = useState('');

  const updateField = (field) => (event) => {
    setLocalError('');
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setLocalError('');
    setForm({ name: '', email: '', password: '', confirmPassword: '' });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');

    const payload = {
      email: form.email.trim(),
      password: form.password,
    };

    if (mode === 'register') {
      if (form.password !== form.confirmPassword) {
        setLocalError('Passwords do not match.');
        return;
      }

      payload.name = form.name.trim();
      await onRegister(payload);
    } else {
      await onLogin(payload);
    }
  };

  return (
    <div className="auth-card">
      <div className="hero-copy">
        <span className="eyebrow">Private task workspace</span>
        <h1>Register, log in, and keep every task tied to the right account.</h1>
        <p>
          Each user sees only their own tasks. Admins can open any user profile, edit roles,
          manage todos, and remove accounts when needed.
        </p>
      </div>

      <div className="auth-panel">
        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === 'login' ? 'tab-button active' : 'tab-button'}
            onClick={() => switchMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'tab-button active' : 'tab-button'}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' ? (
            <label>
              Full name
              <input
                type="text"
                value={form.name}
                onChange={updateField('name')}
                placeholder="Your name"
                autoComplete="name"
                required
              />
            </label>
          ) : null}

          <label>
            Email address
            <input
              type="email"
              value={form.email}
              onChange={updateField('email')}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={updateField('password')}
              placeholder="Enter your password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
            />
          </label>

          {mode === 'register' ? (
            <label>
              Confirm password
              <input
                type="password"
                value={form.confirmPassword}
                onChange={updateField('confirmPassword')}
                placeholder="Retype your password"
                autoComplete="new-password"
                required
              />
            </label>
          ) : null}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Working...' : mode === 'register' ? 'Create account' : 'Log in'}
          </button>
        </form>

        {localError ? <div className="feedback-banner error">{localError}</div> : null}
        {error ? <div className="feedback-banner error">{error}</div> : null}
        {status ? <div className="feedback-banner success">{status}</div> : null}
      </div>
    </div>
  );
};

export default AuthPanel;