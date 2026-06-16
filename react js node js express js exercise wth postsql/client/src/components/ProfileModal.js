/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react';
import { resolveAvatarUrl } from '../api';

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
};

const providerLabel = (provider) => {
  if (provider === 'google') return 'Google';
  if (provider === 'facebook') return 'Facebook';
  return null;
};

const providerIcon = (provider) => {
  if (provider === 'google') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
  if (provider === 'facebook') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.234 2.686.234v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  );
  return null;
};

const ProfileModal = ({
  currentUser,
  busy,
  onClose,
  onSaveProfile,
  onUploadAvatar,
  onRemoveAvatar,
}) => {
  const [tab, setTab] = useState('view');
  const [form, setForm] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    password: '',
    confirmPassword: '',
  });
  const [localError, setLocalError] = useState('');
  const [localStatus, setLocalStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const overlayRef = useRef(null);

  // Sync form when currentUser updates (e.g. after save)
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: currentUser?.name || '',
      email: currentUser?.email || '',
    }));
  }, [currentUser]);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const updateField = (field) => (e) => {
    setLocalError('');
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLocalError('');
    setLocalStatus('');

    if (form.password && form.password !== form.confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    try {
      const payload = { name: form.name, email: form.email };
      if (form.password) payload.password = form.password;
      await onSaveProfile(payload);
      setForm((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      setLocalStatus('Profile updated successfully.');
      setTab('view');
    } catch (err) {
      setLocalError(err.message);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalError('');
    setLocalStatus('');
    setUploading(true);
    try {
      await onUploadAvatar(file);
      setLocalStatus('Profile picture updated.');
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setUploading(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setLocalError('');
    setLocalStatus('');
    setUploading(true);
    try {
      await onRemoveAvatar();
      setLocalStatus('Profile picture removed.');
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const avatarSrc = resolveAvatarUrl(currentUser?.avatarUrl);
  const label = providerLabel(currentUser?.provider);
  const icon = providerIcon(currentUser?.provider);
  const isSsoUser = Boolean(currentUser?.provider);
  const isLocalAvatar = currentUser?.avatarUrl?.startsWith('/uploads/');

  const joinedDate = currentUser?.createdAt
    ? new Date(currentUser.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label="Profile">
      <div className="profile-modal">
        {/* Header */}
        <div className="profile-modal-header">
          <span className="eyebrow">My Profile</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close profile">✕</button>
        </div>

        {/* Avatar section */}
        <div className="profile-avatar-section">
          <div className="profile-avatar-wrapper">
            {avatarSrc ? (
              <img src={avatarSrc} alt={currentUser?.name} className="profile-avatar-img" />
            ) : (
              <div className="profile-avatar-initials">{getInitials(currentUser?.name)}</div>
            )}
            {label && (
              <div className={`provider-badge provider-badge-${currentUser?.provider}`} title={`Signed in with ${label}`}>
                {icon}
              </div>
            )}
          </div>

          <div className="profile-avatar-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="avatar-upload-input"
            />
            <label
              htmlFor="avatar-upload-input"
              className={`primary-button avatar-upload-label${uploading || busy ? ' disabled' : ''}`}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click(); }}
            >
              {uploading ? 'Uploading…' : 'Upload photo'}
            </label>
            {currentUser?.avatarUrl && (
              <button
                type="button"
                className="ghost-button"
                onClick={handleRemove}
                disabled={uploading || busy}
              >
                Remove photo
              </button>
            )}
          </div>

          {isLocalAvatar && (
            <p className="avatar-hint">Custom photo uploaded</p>
          )}
          {isSsoUser && !isLocalAvatar && (
            <p className="avatar-hint">{label} profile picture · Upload to override</p>
          )}
        </div>

        {/* Tabs */}
        <div className="profile-tabs">
          <button
            type="button"
            className={tab === 'view' ? 'tab-button active' : 'tab-button'}
            onClick={() => { setTab('view'); setLocalError(''); setLocalStatus(''); }}
          >
            Details
          </button>
          <button
            type="button"
            className={tab === 'edit' ? 'tab-button active' : 'tab-button'}
            onClick={() => { setTab('edit'); setLocalError(''); setLocalStatus(''); }}
          >
            Edit Profile
          </button>
        </div>

        {/* Feedback */}
        {localError && <div className="feedback-banner error">{localError}</div>}
        {localStatus && <div className="feedback-banner success">{localStatus}</div>}

        {/* View tab */}
        {tab === 'view' && (
          <div className="profile-info-grid">
            <div className="profile-info-row">
              <span className="profile-info-label">Full name</span>
              <span className="profile-info-value">{currentUser?.name}</span>
            </div>
            <div className="profile-info-row">
              <span className="profile-info-label">Email</span>
              <span className="profile-info-value">{currentUser?.email}</span>
            </div>
            <div className="profile-info-row">
              <span className="profile-info-label">Role</span>
              <span className="profile-info-value">
                <span className="role-chip compact">{currentUser?.role}</span>
              </span>
            </div>
            {label && (
              <div className="profile-info-row">
                <span className="profile-info-label">Signed in via</span>
                <span className="profile-info-value provider-row">
                  {icon}
                  {label}
                </span>
              </div>
            )}
            {!isSsoUser && (
              <div className="profile-info-row">
                <span className="profile-info-label">Auth type</span>
                <span className="profile-info-value">Email &amp; password</span>
              </div>
            )}
            <div className="profile-info-row">
              <span className="profile-info-label">Member since</span>
              <span className="profile-info-value">{joinedDate}</span>
            </div>
          </div>
        )}

        {/* Edit tab */}
        {tab === 'edit' && (
          <form className="stack-form" onSubmit={handleSave}>
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
            {!isSsoUser && (
              <>
                <label>
                  New password <span className="field-hint">(leave blank to keep current)</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={updateField('password')}
                    placeholder="New password"
                    autoComplete="new-password"
                  />
                </label>
                {form.password && (
                  <label>
                    Confirm new password
                    <input
                      type="password"
                      value={form.confirmPassword}
                      onChange={updateField('confirmPassword')}
                      placeholder="Retype new password"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                )}
              </>
            )}
            <div className="button-row compact">
              <button type="submit" className="primary-button" disabled={busy || uploading}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="ghost-button" onClick={() => setTab('view')}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;
