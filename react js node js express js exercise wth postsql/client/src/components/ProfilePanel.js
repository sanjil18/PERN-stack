/* eslint-disable react/prop-types */
import React, { useEffect, useState } from 'react';

const ProfilePanel = ({ user, canChangeRole, onSave, onDelete }) => {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        email: user.email || '',
        password: '',
        role: user.role || 'user',
      });
    }
  }, [user]);

  if (!user) {
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      await onSave(form);
      setForm((current) => ({ ...current, password: '' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section-card">
      <div className="section-header">
        <div>
          <p className="eyebrow">Account</p>
          <h2>{user.name}</h2>
        </div>
        <span className={user.role === 'admin' ? 'role-badge admin' : 'role-badge'}>{user.role}</span>
      </div>

      <form className="profile-form" onSubmit={handleSubmit}>
        <label>
          <span>Name</span>
          <input type="text" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label>
          <span>Email</span>
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        </label>
        <label>
          <span>New password</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="Leave blank to keep current password"
          />
        </label>
        {canChangeRole && (
          <label>
            <span>Role</span>
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>
        )}

        <div className="inline-actions">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save profile'}
          </button>
          <button
            type="button"
            className="ghost-button danger"
            onClick={() => onDelete(user.id)}
          >
            Delete {canChangeRole ? 'user' : 'account'}
          </button>
        </div>
      </form>

      <div className="summary-grid">
        <div>
          <span>Account ID</span>
          <strong>#{user.id}</strong>
        </div>
        <div>
          <span>Created</span>
          <strong>{user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Unknown'}</strong>
        </div>
        <div>
          <span>Updated</span>
          <strong>{user.updatedAt ? new Date(user.updatedAt).toLocaleString() : 'Unknown'}</strong>
        </div>
      </div>
    </section>
  );
};

export default ProfilePanel;