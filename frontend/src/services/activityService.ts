import { apiClient } from './apiClient';
import type {
  ActivityCreatePayload,
  ActivityDayResponse,
  ActivityListResponse,
  ActivityResponse,
  ActivityUpdatePayload,
} from '../types';

export const activityService = {
  list: (olderAdultId?: string): Promise<ActivityListResponse> =>
    apiClient.get<ActivityListResponse>(
      olderAdultId
        ? `/activities?olderAdultId=${encodeURIComponent(olderAdultId)}`
        : '/activities'
    ),

  /** HU-020: actividades de hoy con su estado, vistas por el familiar. */
  today: (olderAdultId: string, date?: string): Promise<ActivityDayResponse> =>
    apiClient.get<ActivityDayResponse>(
      `/activities/today?olderAdultId=${encodeURIComponent(olderAdultId)}${
        date ? `&date=${encodeURIComponent(date)}` : ''
      }`
    ),

  create: (payload: ActivityCreatePayload): Promise<ActivityResponse> =>
    apiClient.post<ActivityResponse>('/activities', payload),

  update: (id: string, payload: ActivityUpdatePayload): Promise<ActivityResponse> =>
    apiClient.put<ActivityResponse>(`/activities/${id}`, payload),

  remove: (id: string): Promise<ActivityResponse> =>
    apiClient.delete<ActivityResponse>(`/activities/${id}`),
};
