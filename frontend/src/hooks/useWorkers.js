import { useState, useMemo, useCallback } from 'react';

function normalizeDate(d) {
  if (!d || d === '-' || String(d).includes('SIN') || String(d).includes('N/A')) return '';
  const s = String(d).trim();
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) {
    return `${m1[1].padStart(2, '0')}/${m1[2].padStart(2, '0')}/${m1[3]}`;
  }
  const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m2) {
    return `${m2[3].padStart(2, '0')}/${m2[2].padStart(2, '0')}/${m2[1]}`;
  }
  return s;
}

function normalizeCuspp(c) {
  return (c || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

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
    const discrepancies = [];
    const sbsDisplay = (sbs && sbs.afp && sbs.afp !== 'DESCONOCIDO') ? sbs.afp : afpCertificada;

    // A. Comparación de AFP / Régimen
    if (!siga.includes(afpCertificada)) {
      discrepancies.push(`AFP distinta (SIGA: ${w.previsiona_siga || 'SIN REGISTRO'} | SBS: ${sbsDisplay})`);
    }

    // B. Comparación de CUSPP (si SIGA registra CUSPP y la entidad oficial reporta CUSPP)
    const cusppSiga = normalizeCuspp(w.cuspp_siga);
    const cusppOficial = normalizeCuspp(sbs?.cuspp || afpnet?.cuspp);
    if (cusppSiga && cusppSiga.length >= 6 && cusppOficial && cusppOficial.length >= 6) {
      if (cusppSiga !== cusppOficial) {
        discrepancies.push(`CUSPP distinto (SIGA: ${w.cuspp_siga} | SBS: ${sbs?.cuspp || afpnet?.cuspp})`);
      }
    }

    // C. Comparación de Fecha de Afiliación (si SIGA reporta fecha y SBS reporta fecha)
    const dateSiga = normalizeDate(w.afiliacion_siga);
    const dateSbs = normalizeDate(sbs?.fecha_afiliacion);
    if (dateSiga && dateSbs && dateSbs !== '-') {
      if (dateSiga !== dateSbs) {
        discrepancies.push(`Fec. Afiliación distinta (SIGA: ${dateSiga} | SBS: ${dateSbs})`);
      }
    }

    if (discrepancies.length > 0) {
      return { tone: 'discrepancia', text: discrepancies.join('\n') };
    }

    return { tone: 'coincidente', text: 'Verificado' };
  }

  // 3. No figura en SPP
  if ((sbs && sbs.estado_sbs === 'NO REGISTRADO') || (afpnet && !afpnet.afiliado_spp && afpnet.estado === 'NO REGISTRADO')) {
    const cusppSiga = normalizeCuspp(w.cuspp_siga);
    if (cusppSiga && cusppSiga.length >= 6) {
      return { tone: 'discrepancia', text: `SIGA registra CUSPP ${w.cuspp_siga}, pero figura NO REGISTRADO en SBS` };
    }
    for (const afpName of ['PRIMA', 'INTEGRA', 'PROFUTURO', 'HABITAT']) {
      if (siga.includes(afpName)) {
        return { tone: 'discrepancia', text: `SIGA indica ${w.previsiona_siga}, pero figura NO REGISTRADO en SBS` };
      }
    }
    if (siga.includes('ONP') || siga.includes('SNP') || siga.includes('19990')) {
      return { tone: 'sin_afiliacion', text: 'No registrado en AFP (coincide con ONP/SNP)' };
    }
    if (!siga || siga.includes('SIN')) {
      return { tone: 'sin_afiliacion', text: 'Sin afiliación previa' };
    }
    return { tone: 'discrepancia', text: `SIGA indica ${w.previsiona_siga || 'afiliación'}, pero no figura en SPP` };
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
