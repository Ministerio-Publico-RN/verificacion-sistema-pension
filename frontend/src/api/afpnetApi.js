/**
 * API para servicios AFPNet (archivos de consulta masiva)
 */
import { apiRequest } from './client';

export async function getAfpnetBatches() {
  return await apiRequest('/api/afpnet/batches-info', {
    method: 'GET'
  });
}

export function getAfpnetTemplateUrl(batchId = null) {
  return batchId ? `/api/afpnet/download-template?batch=${batchId}` : '/api/afpnet/download-template';
}

export async function uploadAfpnetResults(file) {
  const formData = new FormData();
  formData.append('file', file);

  return await apiRequest('/api/afpnet/upload-results', {
    method: 'POST',
    body: formData
  });
}

export async function sendAfpnetControl(action) {
  return await apiRequest('/api/afpnet/control', {
    method: 'POST',
    body: JSON.stringify({ action })
  });
}
