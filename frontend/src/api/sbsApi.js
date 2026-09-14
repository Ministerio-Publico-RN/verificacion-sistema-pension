/**
 * API para configuración y verificación SBS real
 */
import { apiRequest } from './client';

export async function getSbsConfig() {
  return await apiRequest('/api/sbs/config', {
    method: 'GET'
  });
}

export async function saveSbsConfig(config) {
  return await apiRequest('/api/sbs/config', {
    method: 'POST',
    body: JSON.stringify(config)
  });
}

export async function verifyWorkerSBS(worker) {
  return await apiRequest('/api/sbs/verify-worker', {
    method: 'POST',
    body: JSON.stringify({
      dni: worker.dni || '',
      ape_paterno: worker.ape_paterno || '',
      ape_materno: worker.ape_materno || '',
      primer_nombre: worker.primer_nombre || '',
      segundo_nombre: worker.segundo_nombre || ''
    })
  });
}

export async function stopSBS() {
  return await apiRequest('/api/sbs/stop', {
    method: 'POST'
  });
}
