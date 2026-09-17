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

const AFP_NAMES = ['INTEGRA', 'PRIMA', 'PROFUTURO', 'HABITAT'];

/**
 * Deriva Régimen (SPP/SNP/Especial) y Previsional (AFP específica u ONP) a partir
 * de los campos del padrón SIGA, para mostrarlos en columnas separadas sin mezclarlos.
 * Usa regimen_siga/previsional_siga si el backend ya los envía; si no, los calcula
 * a partir del campo combinado previsiona_siga (compatibilidad con datos antiguos).
 */
export function splitRegimenPrevisional(w) {
  const peaRegime = w.regi_pens_codigo || w.raw_data?.REGI_PENS_ || w.raw_data?.REGI_PENS || w.raw_data?.REGIPENS;
  if (peaRegime) {
    return {
      regimen: peaRegime,
      previsional: w.previsional_siga || (w.previsiona_siga && !['19990', '20530', '25897', 'E-19990', 'E-AFP', 'E-CM', 'EXONERA', '05188'].includes(w.previsiona_siga) ? w.previsiona_siga : '')
    };
  }

  if (w.regimen_siga !== undefined || w.previsional_siga !== undefined) {
    return { regimen: w.regimen_siga || '', previsional: w.previsional_siga || '' };
  }

  const text = (w.previsiona_siga || '').trim();
  const upper = text.toUpperCase();

  if (!text || upper === '-' || upper.includes('SIN REGISTRO')) {
    return { regimen: '', previsional: '' };
  }

  const exonerado = upper.includes('EXONERA') ? ' (Exonerado de aporte)' : '';

  for (const afp of AFP_NAMES) {
    if (upper.includes(afp)) {
      return { regimen: `SPP${exonerado}`, previsional: afp };
    }
  }

  if (upper.includes('ONP') || upper.includes('SNP') || upper.includes('19990')) {
    return { regimen: `SNP${exonerado}`, previsional: 'ONP' };
  }

  if (upper.includes('20530') || upper.includes('ESPECIAL')) {
    return { regimen: 'RÉGIMEN ESPECIAL D.L. 20530', previsional: '-' };
  }

  return { regimen: text, previsional: '-' };
}

/**
 * Compara, campo por campo, lo declarado en SIGA contra lo hallado en SBS/AFPNet,
 * para pintar cada dato de la columna "Consulta SBS" con su propio ícono de coincidencia.
 */
export function compareWorkerFields(w) {
  const sbs = w.sbs_resultado;
  if (!sbs) return null;

  const afpnet = w.afpnet_resultado;
  const { previsional } = splitRegimenPrevisional(w);
  const previsionalUpper = (previsional || '').toUpperCase();
  const sbsAfp = (sbs.afp || '').toUpperCase();

  let previsionalMatch;
  const targetCheck = (previsionalUpper || w.previsiona_siga || w.regimen_siga || '').toUpperCase();
  if (AFP_NAMES.some(a => targetCheck.includes(a))) {
    previsionalMatch = AFP_NAMES.some(a => targetCheck.includes(a) && sbsAfp.includes(a));
  } else if (targetCheck.includes('ONP') || targetCheck.includes('SNP') || targetCheck.includes('19990') || targetCheck.includes('20530')) {
    previsionalMatch = !sbsAfp || sbsAfp.includes('NO REGISTRADO');
  } else {
    previsionalMatch = false;
  }

  const cusppSiga = normalizeCuspp(w.cuspp_siga);
  const cusppOficial = normalizeCuspp(sbs.cuspp || afpnet?.cuspp);
  const cusppMatch = !!(cusppSiga && cusppSiga.length >= 6 && cusppOficial && cusppOficial.length >= 6 && cusppSiga === cusppOficial);

  const dateSiga = normalizeDate(w.afiliacion_siga);
  const dateSbs = normalizeDate(sbs.fecha_afiliacion);
  const fechaMatch = !!(dateSiga && dateSbs && dateSbs !== '-' && dateSiga === dateSbs);

  return { previsionalMatch, cusppMatch, fechaMatch };
}

export function evaluateWorkerSemaforo(w) {
  const siga = ((w.previsiona_siga || '') + ' ' + (w.regimen_siga || '')).toUpperCase();
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
    const cusppSiga = normalizeCuspp(w.cuspp_siga || w.cuspp);
    const cusppOficial = normalizeCuspp(sbs?.cuspp || afpnet?.cuspp);
    if (cusppSiga && cusppSiga.length >= 6 && cusppOficial && cusppOficial.length >= 6) {
      if (cusppSiga !== cusppOficial) {
        discrepancies.push(`CUSPP distinto (SIGA: ${w.cuspp_siga || w.cuspp} | SBS: ${sbs?.cuspp || afpnet?.cuspp})`);
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

  // 3. No figura en SPP (SBS / AFPNET reporta NO REGISTRADO)
  if ((sbs && sbs.estado_sbs === 'NO REGISTRADO') || (afpnet && !afpnet.afiliado_spp && afpnet.estado === 'NO REGISTRADO')) {
    // Regla 1: Verificar si TIENE un CUSPP que sea un string de 12 caracteres (letras y números) sin espacios intermedios
    const rawCuspp = String(w.cuspp_siga || w.cuspp || '').trim();
    const isExact12Alphanumeric = /^[A-Za-z0-9]{12}$/.test(rawCuspp);
    const isPlaceholder = /^(.)\1{11}$/i.test(rawCuspp); // ej: XXXXXXXXXXXX, 000000000000
    const isOnlyX = /^X+$/i.test(rawCuspp);
    const hasValidCuspp = isExact12Alphanumeric && !isPlaceholder && !isOnlyX;

    // Si tiene un CUSPP real de 12 caracteres en SIGA pero SBS reporta NO REGISTRADO: Discrepancia
    if (hasValidCuspp) {
      return { tone: 'discrepancia', text: `SIGA registra CUSPP ${rawCuspp}, pero figura NO REGISTRADO en SBS` };
    }

    // Regla 3: Si en PREVISIONA tiene el valor "SNP" (o "ONP" / "19990"):
    const isSnp = siga.includes('SNP') || siga.includes('ONP') || siga.includes('19990');
    if (isSnp) {
      return { tone: 'snp', text: 'Inscrito en SNP (ONP) - No registrado en SBS' };
    }

    // Regla 1, 2 y 3 cumplidas:
    // 1. NO TIENE CUSPP de 12 caracteres alfanuméricos (está en blanco, con 'X', 'NO REGISTRADO', etc.)
    // 2. NO TIENE registro en la SBS
    // 3. En PREVISIONA NO TIENE el valor "SNP" (incluso si en SIGA le pusieron PROFUTURO tentativo)
    return { tone: 'sin_afiliacion', text: 'Sin afiliación previa' };
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
    let snpConfirmados = 0; // Inscritos en SNP validados en SBS como no registrados
    let sinAfiliacion = 0; // Nuevos sin afiliación en blanco y sin registro en SBS
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
      else if (sem === 'snp') snpConfirmados++;
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
      snpConfirmados,
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
      if (statusFilter === 'snp') return w.semaforo === 'snp';
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
