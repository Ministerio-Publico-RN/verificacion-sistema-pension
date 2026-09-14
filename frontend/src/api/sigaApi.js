/**
 * API para parseo de archivos SIGA y muestras de datos
 */
import { apiRequest } from './client';
import { FALLBACK_SAMPLE_WORKERS } from './sampleData';

export async function uploadSigaFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await apiRequest('/api/upload', {
      method: 'POST',
      body: formData
    });
    return {
      workers: res.workers || res.data || [],
      filename: res.filename || file.name,
      total: res.total || 0
    };
  } catch (err) {
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      throw new Error(
        'No se pudo conectar con el servidor local (http://localhost:8080). Asegúrese de iniciar el servidor ejecutando "python src/server.py" en la terminal.'
      );
    }
    throw err;
  }
}

export async function fetchSampleData() {
  try {
    const res = await apiRequest('/api/load-sample', { method: 'GET' });
    if (res.workers || res.data) {
      return {
        workers: res.workers || res.data,
        filename: res.filename || 'muestra_altas_cas_2026.dbf'
      };
    }
  } catch (err) {
    console.warn('API /api/load-sample no respondió. Usando muestra precargada del proyecto...', err);
  }

  // Fallback garantizado directo del proyecto
  return {
    workers: FALLBACK_SAMPLE_WORKERS,
    filename: 'altas cas set 2026.DBF (Muestra local)'
  };
}
