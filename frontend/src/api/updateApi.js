import { apiRequest } from './client';

export async function checkAppUpdate() {
  return await apiRequest('/api/app/check-update');
}

export async function applyAppUpdate(downloadUrl = null) {
  return await apiRequest('/api/app/apply-update', {
    method: 'POST',
    body: JSON.stringify({ download_url: downloadUrl })
  });
}

export async function finalizeAppUpdate(options = {}) {
  return await apiRequest('/api/app/finalize-update', {
    method: 'POST',
    body: JSON.stringify(options)
  });
}
