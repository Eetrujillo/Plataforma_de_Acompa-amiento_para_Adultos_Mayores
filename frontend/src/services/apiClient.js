const apiBaseUrl = import.meta.env?.VITE_API_BASE || '/api';

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || `API request failed with status ${response.status}`);
  }

  return data;
}

const apiClient = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body)
  }),
  put: (path, body, options) => request(path, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body)
  }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' })
};

export { apiClient };
export default apiClient;