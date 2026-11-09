import { apiClient } from '../../../shared/services/apiClient.js';

export async function triggerSos({ latitude, longitude, accuracy, message }) {
  const { data } = await apiClient.post('/sos', { latitude, longitude, accuracy, message });
  return data.alert;
}

export async function listActiveAlerts() {
  const { data } = await apiClient.get('/sos/active');
  return data.alerts;
}

export async function resolveAlert(alertId) {
  const { data } = await apiClient.patch(`/sos/${alertId}/resolve`);
  return data.alert;
}
