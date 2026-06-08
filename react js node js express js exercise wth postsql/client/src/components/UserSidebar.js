/* eslint-disable react/prop-types */
import React from 'react';

const UserSidebar = ({ users, selectedUserId, onSelect, currentUser }) => {
  return (
    <aside className="sidebar-card">
      <div className="sidebar-header">
        <div>
          <p className="eyebrow">Admin view</p>
          <h2>All users</h2>
        </div>
        <span className="pill">{users.length} accounts</span>
      </div>

      <div className="user-list">
        {users.map((user) => {
          const isActive = selectedUserId === user.id;
          const isCurrent = currentUser?.id === user.id;

          return (
            <button
              key={user.id}
              type="button"
              className={isActive ? 'user-row active' : 'user-row'}
              onClick={() => onSelect(user.id)}
            >
              <div>
                <strong>{user.name}</strong>
                <p>{user.email}</p>
              </div>
              <div className="user-meta">
                <span className={user.role === 'admin' ? 'role-badge admin' : 'role-badge'}>{user.role}</span>
                <span>{user.todoCount} todos</span>
                {isCurrent && <span className="current-tag">you</span>}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

export default UserSidebar;