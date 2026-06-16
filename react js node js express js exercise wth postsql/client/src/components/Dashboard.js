/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';
import { resolveAvatarUrl } from '../api';
import ProfileModal from './ProfileModal';

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
};

const Dashboard = ({
  currentUser,
  selectedUser,
  selectedUserId,
  users,
  todos,
  isAdmin,
  busy,
  status,
  error,
  onSelectUser,
  onSaveProfile,
  onUploadAvatar,
  onRemoveAvatar,
  onCreateTodo,
  onUpdateTodo,
  onDeleteTodo,
  onRefresh,
  onLogout,
}) => {
  const [newTodo, setNewTodo] = useState('');
  const [editingTodoId, setEditingTodoId] = useState(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    setNewTodo('');
    setEditingTodoId(null);
    setEditingTodoText('');
  }, [selectedUserId]);

  useEffect(() => {
    if (editingTodoId && !todos.some((todo) => todo.id === editingTodoId)) {
      setEditingTodoId(null);
      setEditingTodoText('');
    }
  }, [todos, editingTodoId]);

  const submitTodo = async (event) => {
    event.preventDefault();
    await onCreateTodo(newTodo.trim());
    setNewTodo('');
  };

  const saveTodoEdit = async (todoId) => {
    await onUpdateTodo(todoId, editingTodoText.trim());
    setEditingTodoId(null);
    setEditingTodoText('');
  };

  const selectedIsSelf = currentUser?.id === selectedUser?.id;
  const canEditSelectedUser = isAdmin || selectedIsSelf;
  const avatarSrc = resolveAvatarUrl(currentUser?.avatarUrl);

  return (
    <div className="app-layout">
      {/* Top navigation bar */}
      <header className="top-nav">
        <div className="nav-brand">
          <span className="nav-brand-kicker">PERN Stack</span>
          <span className="nav-brand-title">Task Workspace</span>
        </div>
        <div className="nav-actions">
          <button
            type="button"
            className="profile-icon-btn"
            onClick={() => setProfileOpen(true)}
            aria-label="Open profile"
            title={currentUser?.name}
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt={currentUser?.name} className="nav-avatar-img" />
            ) : (
              <span className="nav-avatar-initials">{getInitials(currentUser?.name)}</span>
            )}
          </button>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="sidebar-card">
          <div className="sidebar-header">
            <div>
              <span className="eyebrow">Signed in</span>
              <h2>{currentUser?.name}</h2>
              <p>{currentUser?.email}</p>
            </div>
            <button className="ghost-button" type="button" onClick={onLogout}>
              Logout
            </button>
          </div>

          <div className="role-chip-row">
            <span className="role-chip">{currentUser?.role}</span>
            <span className="meta-chip">{users.length} user accounts</span>
          </div>

          {isAdmin ? (
            <div className="user-list-block">
              <div className="section-heading">
                <span>Open any profile</span>
                <button className="link-button" type="button" onClick={onRefresh} disabled={busy}>
                  Refresh
                </button>
              </div>

              <div className="user-list">
                {users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className={user.id === selectedUserId ? 'user-row active' : 'user-row'}
                    onClick={() => onSelectUser(user.id)}
                  >
                    <span>
                      <strong>{user.name || `User #${user.id}`}</strong>
                      <small>{user.email}</small>
                    </span>
                    <span className="user-row-meta">
                      <span className="role-chip compact">{user.role}</span>
                      <span className="meta-chip compact">{user.todoCount} todos</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <main className="content-stack">
          <section className="content-card headline-card">
            <div>
              <span className="eyebrow">Tasks</span>
              <h1>{selectedIsSelf ? 'Your tasks' : `${selectedUser?.name || `User #${selectedUser?.id}`}'s tasks`}</h1>
              <p>{selectedIsSelf ? 'Your personal task list.' : `Viewing tasks for ${selectedUser?.email || 'this user'}.`}</p>
            </div>
            <div className="headline-actions">
              <span className="status-chip">{selectedUser?.role || 'user'}</span>
              <span className="status-chip muted">{todos.length} tasks</span>
            </div>
          </section>

          {error ? <section className="content-card banner error">{error}</section> : null}
          {status ? <section className="content-card banner success">{status}</section> : null}

          <section className="content-card">
            <div className="section-heading">
              <span>Tasks</span>
              <div className="section-actions">
                <button className="link-button" type="button" onClick={onRefresh} disabled={busy}>
                  Reload
                </button>
                <span className="meta-chip">Visible only to this account</span>
              </div>
            </div>

            <form className="stack-form compact-gap" onSubmit={submitTodo}>
              <label>
                <span>Create a task</span>
                <div className="inline-form">
                  <input
                    type="text"
                    value={newTodo}
                    onChange={(event) => setNewTodo(event.target.value)}
                    placeholder="Write the next task"
                    disabled={!canEditSelectedUser}
                    required
                  />
                  <button className="add-button" type="submit" disabled={busy || !canEditSelectedUser}>
                    Add
                  </button>
                </div>
              </label>
            </form>

            <div className="todo-list">
              {todos.length === 0 ? (
                <div className="empty-state">No tasks yet. Create the first one above.</div>
              ) : (
                todos.map((todo) => (
                  <article className="todo-row" key={todo.id}>
                    {editingTodoId === todo.id ? (
                      <div className="todo-edit-form">
                        <input
                          type="text"
                          value={editingTodoText}
                          onChange={(event) => setEditingTodoText(event.target.value)}
                          autoFocus
                        />
                        <div className="button-row compact">
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => saveTodoEdit(todo.id)}
                            disabled={busy || !editingTodoText.trim()}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => { setEditingTodoId(null); setEditingTodoText(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p>{todo.description}</p>
                        <div className="button-row compact">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.description); }}
                            disabled={!canEditSelectedUser}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() => onDeleteTodo(todo.id)}
                            disabled={!canEditSelectedUser}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        </main>
      </div>

      {profileOpen && (
        <ProfileModal
          currentUser={currentUser}
          busy={busy}
          onClose={() => setProfileOpen(false)}
          onSaveProfile={onSaveProfile}
          onUploadAvatar={onUploadAvatar}
          onRemoveAvatar={onRemoveAvatar}
        />
      )}
    </div>
  );
};

export default Dashboard;
