import { useState, useMemo, useCallback } from 'react';

export function evaluateWorkerSemaforo(w) {
  const siga = (w.previsiona_siga || '').toUpperCase();
  const sbs = w.sbs_resultado;
  const afpnet = w.afpnet_resultado;

  // 1. Retos de reCAPTCHA, pausas, bloqueos o errores de red
  if (sbs && [
    'RECAPTCHA_CHALLENGE', 'BLOQUEO_SEGURIDAD', 'TIMEOUT', 'ERROR'
  ].includes(sbs.estado_sbs)) {
    return { tone: 'latencia', text: 'Error al consultar' };
  }
  if (sbs && [
    'RETO RECAPTCHA', 'DESCONOCIDO', 'VENTANA CERRADA', 'BLOQUEO TEMPORAL SBS', 'ERROR RED'
  ].includes(sbs.afp)) {
    return { tone: 'latencia', text: 'Error al consultar' };
  }

  // 2. Afiliación certificada en SPP
  let afpCertificada = null;
  if (afpnet?.afiliado_spp) {
    afpCertificada = (afpnet.afp || '').toUpperCase();
  } else if (sbs?.afiliado_spp && sbs.afp && sbs.afp !== 'DESCONOCIDO' && sbs.estado_sbs === 'ENCONTRADO') {
    afpCertificada = (sbs.afp || '').toUpperCase();
  }

  if (afpCertificada) {
    if (siga.includes(afpCertificada)) {
      return { tone: 'coincidente', text: 'Verificado' };
    }
    const sbsDisplay = (sbs && sbs.afp && sbs.afp !== 'DESCONOCIDO') ? sbs.afp : afpCertificada;
    return { tone: 'discrepancia', text: `SIGA: ${siga || 'SIN REGISTRO'}\nSBS: ${sbsDisplay}` };
  }

  // 3. No figura en SPP
  if ((sbs && sbs.estado_sbs === 'NO REGISTRADO') || (afpnet && !afpnet.afiliado_spp && afpnet.estado === 'NO REGISTRADO')) {
    if (siga.includes('ONP') || siga.includes('SNP') || siga.includes('19990')) {
      return { tone: 'sin_afiliacion', text: 'No registrado en AFP (posible ONP)' };
    }
    if (!siga || siga.includes('SIN')) {
      return { tone: 'sin_afiliacion', text: 'Sin afiliación previa' };
    }
    return { tone: 'discrepancia', text: `SIGA indica ${siga}, pero no figura en SPP` };
  }

  return { tone: 'sin_verificar', text: 'Pendiente de consulta' };
}

export function useWorkers() {
  const [workers, setWorkers] = useState([]);
  const [fileName, setFileName] = useState('');
  const [fileMeta, setFileMeta] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const setWorkersData = useCallback((data, name = '', meta = '') => {
    const initialized = data.map((w, index) => {
      const copy = { ...w, num: index + 1 };
      const sem = evaluateWorkerSemaforo(copy);
      copy.semaforo = sem.tone;
      copy.semaforo_texto = sem.text;
      return copy;
    });
    setWorkers(initialized);
    setFileName(name);
    setFileMeta(meta || `${initialized.length} registros`);
    setCurrentPage(1);
  }, []);

  const updateWorker = useCallback((dni, updates) => {
    setWorkers(prev => prev.map(w => {
      if (w.dni !== dni) return w;
      const updated = { ...w, ...updates };
      const sem = evaluateWorkerSemaforo(updated);
      updated.semaforo = sem.tone;
      updated.semaforo_texto = sem.text;
      return updated;
    }));
  }, []);

  const clearWorkers = useCallback(() => {
    setWorkers([]);
    setFileName('');
    setFileMeta('');
    setCurrentPage(1);
  }, []);

  // Métricas completas del padrón y de la verificación SBS
  const metrics = useMemo(() => {
    let spp = 0;
    let snp = 0;
    let consultados = 0;
    let iguales = 0; // coincidentes/validados
    let discrepancias = 0;
    let errores = 0; // latencia, captcha no resuelto, timeouts
    let sinAfiliacion = 0;
    let pendientes = 0;

    const afpBreakdown = {
      integra: 0,
      prima: 0,
      profuturo: 0,
      habitat: 0,
      noRegistrado: 0
    };

    for (const w of workers) {
      if (w.sbs_consultado) {
        consultados++;
      }

      const sem = w.semaforo;
      if (sem === 'coincidente') iguales++;
      else if (sem === 'discrepancia') discrepancias++;
      else if (sem === 'latencia') errores++;
      else if (sem === 'sin_afiliacion') sinAfiliacion++;
      else pendientes++;

      // Padrón SIGA
      const regimen = (w.previsiona_siga || '').toUpperCase();
      if (regimen.includes('SNP') || regimen.includes('ONP') || regimen.includes('19990')) {
        snp++;
      } else if (regimen.includes('INTEGRA') || regimen.includes('PRIMA') || regimen.includes('PROFUTURO') || regimen.includes('HABITAT')) {
        spp++;
      }

      // SBS detectado
      const sbsAfp = (w.sbs_resultado?.afp || '').toUpperCase();
      if (sbsAfp.includes('INTEGRA')) afpBreakdown.integra++;
      else if (sbsAfp.includes('PRIMA')) afpBreakdown.prima++;
      else if (sbsAfp.includes('PROFUTURO')) afpBreakdown.profuturo++;
      else if (sbsAfp.includes('HABITAT')) afpBreakdown.habitat++;
      else if (sbsAfp.includes('NO REGISTRADO')) afpBreakdown.noRegistrado++;
    }

    const pctIguales = consultados > 0 ? Math.round((iguales / consultados) * 100) : 0;

    return {
      total: workers.length,
      spp,
      snp,
      consultados,
      iguales,
      verificados: iguales,
      discrepancias,
      errores,
      sinAfiliacion,
      pendientes,
      pctIguales,
      afpBreakdown
    };
  }, [workers]);

  // Filtros
  const filteredWorkers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workers.filter(w => {
      // Búsqueda
      if (q) {
        const full = `${w.dni || ''} ${w.apellidos_nombres || ''} ${w.cuspp_siga || ''}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      // Filtro de estado
      if (statusFilter === 'all') return true;
      if (statusFilter === 'coincidente') return w.semaforo === 'coincidente';
      if (statusFilter === 'discrepancia') return w.semaforo === 'discrepancia';
      if (statusFilter === 'latencia') return w.semaforo === 'latencia';
      if (statusFilter === 'sin_afiliacion') return w.semaforo === 'sin_afiliacion';
      if (statusFilter === 'sin_verificar') return !w.semaforo || w.semaforo === 'sin_verificar';
      // Filtros por composicion del padron
      if (statusFilter === 'filter_snp') {
        const r = (w.previsiona_siga || '').toUpperCase();
        return r.includes('SNP') || r.includes('ONP') || r.includes('19990');
      }
      if (statusFilter === 'filter_integra') return (w.previsiona_siga || '').toUpperCase().includes('INTEGRA');
      if (statusFilter === 'filter_prima') return (w.previsiona_siga || '').toUpperCase().includes('PRIMA');
      if (statusFilter === 'filter_profuturo') return (w.previsiona_siga || '').toUpperCase().includes('PROFUTURO');
      if (statusFilter === 'filter_habitat') return (w.previsiona_siga || '').toUpperCase().includes('HABITAT');
      if (statusFilter === 'filter_blanco') {
        const r = (w.previsiona_siga || '').toUpperCase().trim();
        return !r || r === '-' || r.includes('SIN');
      }
      return true;
    });
  }, [workers, searchQuery, statusFilter]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filteredWorkers.length / pageSize));
  const paginatedWorkers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredWorkers.slice(start, start + pageSize);
  }, [filteredWorkers, currentPage, pageSize]);

  return {
    workers,
    filteredWorkers,
    paginatedWorkers,
    fileName,
    fileMeta,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    metrics,
    setWorkersData,
    updateWorker,
    clearWorkers
  };
}
