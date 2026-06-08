
import { useEffect, useMemo, useState } from 'react';
import './App.css';
import AuthPanel from './components/AuthPanel';
import Dashboard from './components/Dashboard';
import { apiRequest } from './api';

const STORAGE_KEY = 'pern-stack-auth-token';

function App() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [todos, setTodos] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const isAuthenticated = useMemo(() => Boolean(authToken && currentUser), [authToken, currentUser]);
  const isAdmin = currentUser?.role === 'admin';

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
    if (!authToken || !user) {
      return;
    }

    if (user.role !== 'admin') {
      setUsers([user]);
      return;
    }

    const nextUsers = await apiRequest('/users', { token: authToken });
    setUsers(nextUsers);
  };

  const refreshSelectedUser = async (userId = selectedUserId, viewerId = currentUser?.id) => {
    if (!authToken || !userId) {
      return;
    }

    const details = await apiRequest(`/users/${userId}`, { token: authToken });
    setSelectedUser(details.user);
    setTodos(details.todos);

    if (details.user.id === viewerId) {
      setCurrentUser(details.user);
    }

    return details;
  };

  useEffect(() => {
    let ignore = false;

    const hydrateSession = async () => {
      if (!authToken) {
        if (!ignore) {
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      try {
        const response = await apiRequest('/auth/me', { token: authToken });
        if (ignore) {
          return;
        }

        setCurrentUser(response.user);
        setSelectedUserId(response.user.id);
        setSelectedUser(response.user);
        setTodos([]);

        if (response.user.role === 'admin') {
          const adminUsers = await apiRequest('/users', { token: authToken });
          if (!ignore) {
            setUsers(adminUsers);
          }
        } else if (!ignore) {
          setUsers([response.user]);
        }
      } catch (sessionError) {
        if (!ignore) {
          clearSession();
          setError(sessionError.message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    hydrateSession();

    return () => {
      ignore = true;
    };
  }, [authToken]);

  useEffect(() => {
    let ignore = false;

    const hydrateSelectedUser = async () => {
      if (!authToken || !selectedUserId) {
        return;
      }

      try {
        const details = await apiRequest(`/users/${selectedUserId}`, { token: authToken });
        if (!ignore) {
          setSelectedUser(details.user);
          setTodos(details.todos);
        }
      } catch (selectedError) {
        if (!ignore) {
          setError(selectedError.message);
        }
      }
    };

    hydrateSelectedUser();

    return () => {
      ignore = true;
    };
  }, [authToken, selectedUserId]);

  const handleLogin = async (credentials) =>
    withBusy(async () => {
      const session = await apiRequest('/auth/login', {
        method: 'POST',
        body: credentials,
      });
      setSession(session);
      await refreshUsers(session.user);
      await refreshSelectedUser(session.user.id, session.user.id);
      setStatus('Welcome back.');
    });

  const handleRegister = async (credentials) =>
    withBusy(async () => {
      const session = await apiRequest('/auth/register', {
        method: 'POST',
        body: credentials,
      });
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
    if (userId === selectedUserId) {
      return;
    }

    await withBusy(async () => {
      setSelectedUserId(userId);
      await refreshSelectedUser(userId, currentUser?.id);
      setStatus('');
    });
  };

  const handleSaveProfile = async (profile) =>
    withBusy(async () => {
      if (!selectedUserId) {
        return;
      }

      const payload = {
        name: profile.name,
        email: profile.email,
        password: profile.password,
      };

      if (isAdmin) {
        payload.role = profile.role;
      }

      const response = await apiRequest(`/users/${selectedUserId}`, {
        method: 'PUT',
        token: authToken,
        body: payload,
      });

      if (response?.user) {
        if (response.user.id === currentUser?.id) {
          setCurrentUser(response.user);
        }

        if (response.user.id === selectedUserId) {
          setSelectedUser(response.user);
        }
      }

      await refreshUsers(response.user);
      await refreshSelectedUser(selectedUserId, currentUser?.id);
      setStatus('Account updated.');
    });

  const handleDeleteUser = async () =>
    withBusy(async () => {
      if (!selectedUserId) {
        return;
      }

      await apiRequest(`/users/${selectedUserId}`, {
        method: 'DELETE',
        token: authToken,
      });

      if (selectedUserId === currentUser?.id) {
        handleLogout();
        return;
      }

      const nextSelectedUserId = currentUser?.id || null;
      setSelectedUserId(nextSelectedUserId);
      await refreshUsers(currentUser);
      if (nextSelectedUserId) {
        await refreshSelectedUser(nextSelectedUserId, currentUser?.id);
      }
      setStatus('Account deleted.');
    });

  const handleCreateTodo = async (description) =>
    withBusy(async () => {
      if (!selectedUserId) {
        return;
      }

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
      await apiRequest(`/todos/${todoId}`, {
        method: 'PUT',
        token: authToken,
        body: { description },
      });

      await refreshSelectedUser(selectedUserId, currentUser?.id);
      setStatus('Task updated.');
    });

  const handleDeleteTodo = async (todoId) =>
    withBusy(async () => {
      await apiRequest(`/todos/${todoId}`, {
        method: 'DELETE',
        token: authToken,
      });

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
