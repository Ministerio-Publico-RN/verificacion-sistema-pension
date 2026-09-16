import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { verifyWorkerSBS, stopSBS, getSbsConfig, saveSbsConfig, getSbsAttempts } from '../api/sbsApi';
import { updateExecutionStatus } from '../api/sigaApi';

export function useSbsStream({ onWorkerUpdate, onLog }) {
  const [status, setStatus] = useState('idle'); // idle | running | paused | stopped | completed
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [activeWindows, setActiveWindows] = useState(3);
  const [headless, setHeadless] = useState(false);
  const [captchaAlert, setCaptchaAlert] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [inProgressDnis, setInProgressDnis] = useState(() => new Set());
  const [attemptCounts, setAttemptCounts] = useState({});

  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);

  // Timer de ejecución
  useEffect(() => {
    let interval = null;
    if (status === 'running') {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

  // Sondeo del número de intento en curso por DNI (para el tag "Revisando #N")
  useEffect(() => {
    if (status !== 'running' && status !== 'paused') {
      setAttemptCounts({});
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await getSbsAttempts();
        if (!cancelled) setAttemptCounts(res?.attempts || {});
      } catch (_) {}
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [status]);

  const formattedTime = useMemo(() => {
    const hrs = Math.floor(elapsedSeconds / 3600);
    const mins = Math.floor((elapsedSeconds % 3600) / 60);
    const secs = elapsedSeconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [elapsedSeconds]);

  // Restaura el progreso/estado del panel al abrir una ejecución guardada desde el historial,
  // en vez de arrancar siempre desde 0 como si fuera una ejecución nueva.
  const hydrateProgress = useCallback(({ current, total, completed, elapsedSeconds: elapsed }) => {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    setProgress({ current, total, percent });
    setElapsedSeconds(Math.max(0, Math.round(elapsed || 0)));
    setStatus(completed ? 'completed' : 'stopped');
  }, []);

  const reloadConfig = useCallback(async () => {
    try {
      const cfg = await getSbsConfig();
      if (cfg) {
        if (typeof cfg.headless === 'boolean') setHeadless(cfg.headless);
        if (cfg.concurrency) setActiveWindows(cfg.concurrency);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    reloadConfig();
  }, [reloadConfig]);

  const toggleHeadless = useCallback(async () => {
    const nextVal = !headless;
    setHeadless(nextVal);
    try {
      await saveSbsConfig({ headless: nextVal });
      if (onLog) {
        const time = new Date().toLocaleTimeString('es-PE', { hour12: false });
        onLog({
          id: Date.now(),
          time,
          message: nextVal ? 'Modo cambiado a: Segundo Plano (Silencioso).' : 'Modo cambiado a: Ventana Visible en Pantalla.',
          type: 'info'
        });
      }
    } catch (err) {
      if (onLog) {
        const time = new Date().toLocaleTimeString('es-PE', { hour12: false });
        onLog({ id: Date.now(), time, message: `Error al cambiar modo: ${err.message}`, type: 'error' });
      }
    }
  }, [headless, onLog]);

  const appendLog = useCallback((message, type = 'info') => {
    const time = new Date().toLocaleTimeString('es-PE', { hour12: false });
    if (onLog) onLog({ id: Date.now() + Math.random(), time, message, type });
  }, [onLog]);

  const waitIfPaused = async () => {
    while (isPausedRef.current && !isCancelledRef.current) {
      await new Promise(r => setTimeout(r, 400));
    }
  };

  // Acepta un número fijo ("2.5") o un rango ("10-20") para la espera entre consultas
  const parseDelayRangeMs = (raw) => {
    if (raw === undefined || raw === null || raw === '') return { minMs: 2000, maxMs: 2000 };
    const str = String(raw).trim();
    const rangeMatch = str.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const a = Math.max(0, parseFloat(rangeMatch[1]) * 1000);
      const b = Math.max(0, parseFloat(rangeMatch[2]) * 1000);
      return { minMs: Math.min(a, b), maxMs: Math.max(a, b) };
    }
    const num = parseFloat(str);
    if (Number.isNaN(num)) return { minMs: 2000, maxMs: 2000 };
    const ms = Math.max(0, num * 1000);
    return { minMs: ms, maxMs: ms };
  };

  const startScraping = useCallback(async (workersToQuery, executionId = null, opts = {}) => {
    const { resetTimer = true, baseProgress = null } = opts;

    if (!workersToQuery || workersToQuery.length === 0) {
      alert('No hay trabajadores para consultar.');
      return;
    }

    isCancelledRef.current = false;
    isPausedRef.current = false;
    if (resetTimer) setElapsedSeconds(0);
    setStatus('running');
    setCaptchaAlert(null);

    // El total/actual reflejan la ejecución completa cuando se retoma desde un punto previo,
    // no solo el lote de trabajadores pendientes que se va a consultar ahora.
    const total = baseProgress ? baseProgress.total : workersToQuery.length;
    const startingCompleted = baseProgress ? baseProgress.current : 0;
    setProgress({
      current: startingCompleted,
      total,
      percent: total > 0 ? Math.round((startingCompleted / total) * 100) : 0
    });

    // Cargar config actual de SBS
    let delayRange = { minMs: 2000, maxMs: 2000 };
    let workerConcurrency = 3;
    try {
      const cfg = await getSbsConfig();
      if (cfg?.delay_between !== undefined) {
        delayRange = parseDelayRangeMs(cfg.delay_between);
      }
      if (cfg?.concurrency) {
        workerConcurrency = Math.max(1, Math.min(10, Number(cfg.concurrency)));
        setActiveWindows(workerConcurrency);
      }
    } catch (_) {}

    const batchTotal = workersToQuery.length;
    appendLog(`Iniciando motor SBS con ${workerConcurrency} ${workerConcurrency === 1 ? 'ventana' : 'ventanas simultáneas'} para ${batchTotal} trabajadores...`, 'info');

    let nextIndex = 0;
    let completed = startingCompleted;

    const runSlot = async (slotId) => {
      while (nextIndex < batchTotal && !isCancelledRef.current) {
        await waitIfPaused();
        if (isCancelledRef.current) break;

        const idx = nextIndex++;
        if (idx >= batchTotal) break;

        const worker = workersToQuery[idx];
        const dni = worker.dni;
        const nombre = worker.apellidos_nombres || worker.nombre_completo || dni;
        const tag = workerConcurrency > 1 ? `[V-${slotId + 1}]` : '';

        appendLog(`[${idx + 1}/${batchTotal}]${tag} Consultando SBS: ${nombre} (${dni})...`, 'info');
        setInProgressDnis(prev => new Set(prev).add(dni));

        try {
          const sbsRes = await verifyWorkerSBS(worker, executionId);

          completed++;
          const pct = Math.round((completed / total) * 100);
          setProgress({ current: completed, total, percent: pct });

          onWorkerUpdate?.(dni, {
            sbs_resultado: sbsRes,
            sbs_consultado: sbsRes?.estado_sbs !== 'CANCELADO'
          });

          const afpText = sbsRes?.afp || (sbsRes?.afiliado_spp ? 'ENCONTRADO' : 'NO REGISTRADO');
          appendLog(`[OK]${tag} DNI ${dni} -> ${afpText} (${sbsRes?.tiempo_seg || 0}s)`, 'success');
        } catch (err) {
          completed++;
          setProgress({ current: completed, total, percent: Math.round((completed / total) * 100) });
          appendLog(`[ERROR]${tag} DNI ${dni}: ${err.message}`, 'error');
        } finally {
          setInProgressDnis(prev => {
            if (!prev.has(dni)) return prev;
            const next = new Set(prev);
            next.delete(dni);
            return next;
          });
        }

        if (!isCancelledRef.current && nextIndex < batchTotal) {
          const waitMs = delayRange.maxMs > delayRange.minMs
            ? delayRange.minMs + Math.random() * (delayRange.maxMs - delayRange.minMs)
            : delayRange.minMs;
          if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
        }
      }
    };

    const slotCount = Math.min(workerConcurrency, batchTotal);
    const slots = [];
    for (let s = 0; s < slotCount; s++) {
      slots.push(runSlot(s));
    }
    await Promise.all(slots);

    if (isCancelledRef.current) {
      setStatus('stopped');
      appendLog('Verificación SBS detenida por el usuario.', 'warning');
    } else {
      setStatus('completed');
      appendLog('¡Verificación SBS completada para todos los trabajadores!', 'success');
      if (executionId) {
        try { await updateExecutionStatus(executionId, 'completado'); } catch (_) {}
      }
      // Cerrar automáticamente todas las ventanas del navegador abiertas para la verificación,
      // en vez de dejarlas abiertas tras terminar al 100%.
      try {
        await stopSBS();
        appendLog('Ventanas del navegador SBS cerradas automáticamente.', 'info');
      } catch (_) {}
    }
  }, [appendLog, onWorkerUpdate]);

  const pauseScraping = useCallback(() => {
    isPausedRef.current = true;
    setStatus('paused');
    appendLog('Verificación SBS en pausa.', 'warning');
  }, [appendLog]);

  const resumeScraping = useCallback(() => {
    isPausedRef.current = false;
    setStatus('running');
    appendLog('Verificación SBS reanudada.', 'info');
  }, [appendLog]);

  const stopScraping = useCallback(async () => {
    isCancelledRef.current = true;
    isPausedRef.current = false;
    setStatus('stopped');
    setInProgressDnis(new Set());
    appendLog('Deteniendo sesión del navegador SBS...', 'warning');
    try {
      await stopSBS();
      appendLog('Todas las ventanas del navegador fueron cerradas.', 'warning');
    } catch (_) {}
  }, [appendLog]);

  useEffect(() => {
    return () => {
      isCancelledRef.current = true;
    };
  }, []);

  return {
    status,
    progress,
    activeWindows,
    headless,
    toggleHeadless,
    reloadConfig,
    hydrateProgress,
    elapsedSeconds,
    formattedTime,
    inProgressDnis,
    attemptCounts,
    captchaAlert,
    dismissCaptcha: () => setCaptchaAlert(null),
    startScraping,
    pauseScraping,
    resumeScraping,
    stopScraping
  };
}
