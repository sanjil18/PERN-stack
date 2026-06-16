const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const apiRequest = async (path, options = {}) => {
  const { token, body, ...requestOptions } = options;
  const headers = { 'Content-Type': 'application/json' };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (requestOptions.headers) Object.assign(headers, requestOptions.headers);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
};

export const apiUpload = async (path, formData, token) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Upload failed');
  return payload;
};

export const resolveAvatarUrl = (avatarUrl) => {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl;
  return `${API_BASE_URL}${avatarUrl}`;
};

export { API_BASE_URL };
