import apiClient from './apiClient.js';

export function getHealth() {
  return apiClient.get('/health');
}