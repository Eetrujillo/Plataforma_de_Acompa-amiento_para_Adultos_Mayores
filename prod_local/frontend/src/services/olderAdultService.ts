import { apiClient } from './apiClient';
import type {
  OlderAdultCreatePayload,
  OlderAdultLinkingCodeResponse,
  OlderAdultListResponse,
  OlderAdultResponse,
  OlderAdultUpdatePayload,
  RedeemLinkingCodePayload,
  RedeemLinkingCodeResponse,
} from '../types';

export const olderAdultService = {
  list: (): Promise<OlderAdultListResponse> => apiClient.get<OlderAdultListResponse>('/older-adults'),

  get: (id: string): Promise<OlderAdultResponse> =>
    apiClient.get<OlderAdultResponse>(`/older-adults/${id}`),

  create: (payload: OlderAdultCreatePayload): Promise<OlderAdultResponse> =>
    apiClient.post<OlderAdultResponse>('/older-adults', payload),

  update: (id: string, payload: OlderAdultUpdatePayload): Promise<OlderAdultResponse> =>
    apiClient.put<OlderAdultResponse>(`/older-adults/${id}`, payload),

  generateLinkingCode: (id: string): Promise<OlderAdultLinkingCodeResponse> =>
    apiClient.post<OlderAdultLinkingCodeResponse>(`/older-adults/${id}/linking-code`, {}),

  unlink: (id: string): Promise<OlderAdultResponse> =>
    apiClient.post<OlderAdultResponse>(`/older-adults/${id}/unlink`, {}),

  redeemLinkingCode: (payload: RedeemLinkingCodePayload): Promise<RedeemLinkingCodeResponse> =>
    apiClient.post<RedeemLinkingCodeResponse>('/linking/redeem', payload),
};
