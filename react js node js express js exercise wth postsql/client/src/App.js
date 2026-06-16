
import { useEffect, useMemo, useState } from 'react';
import './App.css';
import AuthPanel from './components/AuthPanel';
import Dashboard from './components/Dashboard';
import { apiRequest, apiUpload } from './api';

const STORAGE_KEY = 'pern-stack-auth-token';

function App() {
  const [authToken, setAuthToken] = useState(() => {
    const queryParams = new URLSearchParams(globalThis.location.search);
    return queryParams.get('token') || localStorage.getItem(STORAGE_KEY) || '';
  });
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [todos, setTodos] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [socialProviders, setSocialProviders] = useState({
    googleConfigured: false,
    facebookConfigured: false,
  });

  const isAuthenticated = useMemo(() => Boolean(authToken && currentUser), [authToken, currentUser]);
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    let ignore = false;
    const loadSocialProviders = async () => {
      try {
        const providers = await apiRequest('/auth/providers');
        if (!ignore) setSocialProviders(providers);
      } catch {
        if (!ignore) setSocialProviders({ googleConfigured: false, facebookConfigured: false });
      }
    };
    loadSocialProviders();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    const url = new URL(globalThis.location.href);
    const tokenFromQuery = url.searchParams.get('token');
    const authErrorFromQuery = url.searchParams.get('auth_error');
    let changed = false;

    if (tokenFromQuery) {
      localStorage.setItem(STORAGE_KEY, tokenFromQuery);
      setAuthToken(tokenFromQuery);
      url.searchParams.delete('token');
      changed = true;
    }

    if (authErrorFromQuery) {
      setError('Social login could not complete. Please use email/password or check your OAuth settings.');
      url.searchParams.delete('auth_error');
      changed = true;
    }

    if (changed) {
      globalThis.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const clearSession = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken('');
    setCurrentUser(null);
    setSelectedUserId(null);
    setSelectedUser(null);
    setTodos([]);
    setUsers([]);
  };

  const setSession = (session) => {
    localStorage.setItem(STORAGE_KEY, session.token);
    setAuthToken(session.token);
    setCurrentUser(session.user);
    setSelectedUserId(session.user.id);
    setStatus('');
    setError('');
  };

  const withBusy = async (task) => {
    setBusy(true);
    setError('');
    try {
      return await task();
    } catch (taskError) {
      setError(taskError.message);
      throw taskError;
    } finally {
      setBusy(false);
    }
  };

  const refreshUsers = async (user = currentUser) => {
    if (!authToken || !user) return;
    if (user.role !== 'admin') { setUsers([user]); return; }
    const nextUsers = await apiRequest('/users', { token: authToken });
    setUsers(nextUsers);
  };

  const refreshSelectedUser = async (userId = selectedUserId, viewerId = currentUser?.id) => {
    if (!authToken || !userId) return;
    const details = await apiRequest(`/users/${userId}`, { token: authToken });
    setSelectedUser(details.user);
    setTodos(details.todos);
    if (details.user.id === viewerId) setCurrentUser(details.user);
    return details;
  };

  useEffect(() => {
    let ignore = false;
    const hydrateSession = async () => {
      if (!authToken) { if (!ignore) setLoading(false); return; }
      setLoading(true);
      try {
        const response = await apiRequest('/auth/me', { token: authToken });
        if (ignore) return;
        setCurrentUser(response.user);
        setSelectedUserId(response.user.id);
        setSelectedUser(response.user);
        setTodos([]);
        if (response.user.role === 'admin') {
          const adminUsers = await apiRequest('/users', { token: authToken });
          if (!ignore) setUsers(adminUsers);
        } else if (!ignore) {
          setUsers([response.user]);
        }
      } catch (sessionError) {
        if (!ignore) { clearSession(); setError(sessionError.message); }
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    hydrateSession();
    return () => { ignore = true; };
  }, [authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let ignore = false;
    const hydrateSelectedUser = async () => {
      if (!authToken || !selectedUserId) return;
      try {
        const details = await apiRequest(`/users/${selectedUserId}`, { token: authToken });
        if (!ignore) { setSelectedUser(details.user); setTodos(details.todos); }
      } catch (selectedError) {
        if (!ignore) setError(selectedError.message);
      }
    };
    hydrateSelectedUser();
    return () => { ignore = true; };
  }, [authToken, selectedUserId]);

  const handleLogin = async (credentials) =>
    withBusy(async () => {
      const session = await apiRequest('/auth/login', { method: 'POST', body: credentials });
      setSession(session);
      await refreshUsers(session.user);
      await refreshSelectedUser(session.user.id, session.user.id);
      setStatus('Welcome back.');
    });

  const handleRegister = async (credentials) =>
    withBusy(async () => {
      const session = await apiRequest('/auth/register', { method: 'POST', body: credentials });
      setSession(session);
      await refreshUsers(session.user);
      await refreshSelectedUser(session.user.id, session.user.id);
      setStatus('Account created.');
    });

  const handleLogout = () => {
    clearSession();
    setStatus('');
    setError('');
    setLoading(false);
  };

  const handleSelectUser = async (userId) => {
    if (userId === selectedUserId) return;
    await withBusy(async () => {
      setSelectedUserId(userId);
      await refreshSelectedUser(userId, currentUser?.id);
      setStatus('');
    });
  };

  const handleSaveProfile = async (profile) =>
    withBusy(async () => {
      if (!selectedUserId) return;
      const payload = { name: profile.name, email: profile.email, password: profile.password };
      if (isAdmin) payload.role = profile.role;
      const response = await apiRequest(`/users/${selectedUserId}`, {
        method: 'PUT',
        token: authToken,
        body: payload,
      });
      if (response?.user) {
        if (response.user.id === currentUser?.id) setCurrentUser(response.user);
        if (response.user.id === selectedUserId) setSelectedUser(response.user);
      }
      await refreshUsers(response.user);
      await refreshSelectedUser(selectedUserId, currentUser?.id);
      setStatus('Account updated.');
    });

  const handleUploadAvatar = async (file) =>
    withBusy(async () => {
      if (!currentUser?.id) return;
      const formData = new FormData();
      formData.append('avatar', file);
      const response = await apiUpload(`/users/${currentUser.id}/avatar`, formData, authToken);
      if (response?.user) {
        setCurrentUser(response.user);
        if (selectedUserId === currentUser.id) setSelectedUser(response.user);
        setUsers((prev) => prev.map((u) => (u.id === response.user.id ? { ...u, avatarUrl: response.user.avatarUrl } : u)));
      }
      setStatus('Profile picture updated.');
    });

  const handleRemoveAvatar = async () =>
    withBusy(async () => {
      if (!currentUser?.id) return;
      const response = await apiRequest(`/users/${currentUser.id}/avatar`, {
        method: 'DELETE',
        token: authToken,
      });
      if (response?.user) {
        setCurrentUser(response.user);
        if (selectedUserId === currentUser.id) setSelectedUser(response.user);
        setUsers((prev) => prev.map((u) => (u.id === response.user.id ? { ...u, avatarUrl: null } : u)));
      }
      setStatus('Profile picture removed.');
    });

  const handleDeleteUser = async () =>
    withBusy(async () => {
      if (!selectedUserId) return;
      await apiRequest(`/users/${selectedUserId}`, { method: 'DELETE', token: authToken });
      if (selectedUserId === currentUser?.id) { handleLogout(); return; }
      const nextSelectedUserId = currentUser?.id || null;
      setSelectedUserId(nextSelectedUserId);
      await refreshUsers(currentUser);
      if (nextSelectedUserId) await refreshSelectedUser(nextSelectedUserId, currentUser?.id);
      setStatus('Account deleted.');
    });

  const handleCreateTodo = async (description) =>
    withBusy(async () => {
      if (!selectedUserId) return;
      await apiRequest(`/users/${selectedUserId}/todos`, {
        method: 'POST',
        token: authToken,
        body: { description },
      });
      await refreshSelectedUser(selectedUserId, currentUser?.id);
      await refreshUsers(currentUser);
      setStatus('Task created.');
    });

  const handleUpdateTodo = async (todoId, description) =>
    withBusy(async () => {
      await apiRequest(`/todos/${todoId}`, { method: 'PUT', token: authToken, body: { description } });
      await refreshSelectedUser(selectedUserId, currentUser?.id);
      setStatus('Task updated.');
    });

  const handleDeleteTodo = async (todoId) =>
    withBusy(async () => {
      await apiRequest(`/todos/${todoId}`, { method: 'DELETE', token: authToken });
      await refreshSelectedUser(selectedUserId, currentUser?.id);
      await refreshUsers(currentUser);
      setStatus('Task deleted.');
    });

  if (loading) {
    return (
      <div className="app-shell loading-shell">
        <div className="loading-card">
          <span className="loading-kicker">PERN Stack</span>
          <h1>Loading secure workspace</h1>
          <p>Preparing your session and protected task data.</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app-shell auth-shell">
        <AuthPanel
          error={error}
          status={status}
          busy={busy}
          socialProviders={socialProviders}
          onLogin={handleLogin}
          onRegister={handleRegister}
        />
      </div>
    );
  }

  return (
    <div className="app-shell dashboard-shell">
      <Dashboard
        currentUser={currentUser}
        selectedUser={selectedUser}
        selectedUserId={selectedUserId}
        users={users}
        todos={todos}
        isAdmin={isAdmin}
        busy={busy}
        status={status}
        error={error}
        onSelectUser={handleSelectUser}
        onSaveProfile={handleSaveProfile}
        onUploadAvatar={handleUploadAvatar}
        onRemoveAvatar={handleRemoveAvatar}
        onDeleteUser={handleDeleteUser}
        onCreateTodo={handleCreateTodo}
        onUpdateTodo={handleUpdateTodo}
        onDeleteTodo={handleDeleteTodo}
        onRefresh={() => refreshSelectedUser(selectedUserId)}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default App;
