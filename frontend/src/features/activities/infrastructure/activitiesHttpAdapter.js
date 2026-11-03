import { apiClient } from '../../../shared/services/apiClient.js';

export async function fetchDailyRoutine({ seniorId, date }) {
  const { data } = await apiClient.get('/activities/daily', { params: { seniorId, date } });
  return data;
}

export async function createActivity(payload) {
  const { data } = await apiClient.post('/activities', payload);
  return data.activity;
}

export async function completeActivity(activityId) {
  const { data } = await apiClient.patch(`/activities/${activityId}/complete`);
  return data.activity;
}
