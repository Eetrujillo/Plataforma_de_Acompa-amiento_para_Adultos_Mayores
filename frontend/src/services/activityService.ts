import { apiClient } from './apiClient';
import type {
  ActivityCreatePayload,
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

  create: (payload: ActivityCreatePayload): Promise<ActivityResponse> =>
    apiClient.post<ActivityResponse>('/activities', payload),

  update: (id: string, payload: ActivityUpdatePayload): Promise<ActivityResponse> =>
    apiClient.put<ActivityResponse>(`/activities/${id}`, payload),

  remove: (id: string): Promise<ActivityResponse> =>
    apiClient.delete<ActivityResponse>(`/activities/${id}`),
};
