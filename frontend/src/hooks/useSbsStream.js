import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { verifyWorkerSBS, stopSBS, getSbsConfig, saveSbsConfig } from '../api/sbsApi';

export function useSbsStream({ onWorkerUpdate, onLog }) {
  const [status, setStatus] = useState('idle'); // idle | running | paused | completed
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [activeWindows, setActiveWindows] = useState(1);
  const [headless, setHeadless] = useState(false);
  const [captchaAlert, setCaptchaAlert] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

  const formattedTime = useMemo(() => {
    const hrs = Math.floor(elapsedSeconds / 3600);
    const mins = Math.floor((elapsedSeconds % 3600) / 60);
    const secs = elapsedSeconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [elapsedSeconds]);

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

  const startScraping = useCallback(async (workersToQuery) => {
    if (!workersToQuery || workersToQuery.length === 0) {
      alert('No hay trabajadores para consultar.');
      return;
    }

    isCancelledRef.current = false;
    isPausedRef.current = false;
    setElapsedSeconds(0);
    setStatus('running');
    setCaptchaAlert(null);

    const total = workersToQuery.length;
    setProgress({ current: 0, total, percent: 0 });

    // Cargar config actual de SBS
    let delayMs = 1000;
    let workerConcurrency = 1;
    try {
      const cfg = await getSbsConfig();
      if (cfg?.delay_between !== undefined) {
        delayMs = Math.round(Number(cfg.delay_between) * 1000);
      }
      if (cfg?.concurrency) {
        workerConcurrency = Math.max(1, Math.min(10, Number(cfg.concurrency)));
        setActiveWindows(workerConcurrency);
      }
    } catch (_) {}

    appendLog(`Iniciando motor SBS con ${workerConcurrency} ${workerConcurrency === 1 ? 'ventana' : 'ventanas simultáneas'} para ${total} trabajadores...`, 'info');

    let nextIndex = 0;
    let completed = 0;

    const runSlot = async (slotId) => {
      while (nextIndex < total && !isCancelledRef.current) {
        await waitIfPaused();
        if (isCancelledRef.current) break;

        const idx = nextIndex++;
        if (idx >= total) break;

        const worker = workersToQuery[idx];
        const dni = worker.dni;
        const nombre = worker.apellidos_nombres || worker.nombre_completo || dni;
        const tag = workerConcurrency > 1 ? `[V-${slotId + 1}]` : '';

        appendLog(`[${idx + 1}/${total}]${tag} Consultando SBS: ${nombre} (${dni})...`, 'info');

        try {
          const sbsRes = await verifyWorkerSBS(worker);

          completed++;
          const pct = Math.round((completed / total) * 100);
          setProgress({ current: completed, total, percent: pct });

          onWorkerUpdate?.(dni, {
            sbs_resultado: sbsRes,
            sbs_consultado: true
          });

          const afpText = sbsRes?.afp || (sbsRes?.afiliado_spp ? 'ENCONTRADO' : 'NO REGISTRADO');
          appendLog(`[OK]${tag} DNI ${dni} -> ${afpText} (${sbsRes?.tiempo_seg || 0}s)`, 'success');
        } catch (err) {
          completed++;
          setProgress({ current: completed, total, percent: Math.round((completed / total) * 100) });
          appendLog(`[ERROR]${tag} DNI ${dni}: ${err.message}`, 'error');
        }

        if (!isCancelledRef.current && delayMs > 0 && nextIndex < total) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    };

    const slotCount = Math.min(workerConcurrency, total);
    const slots = [];
    for (let s = 0; s < slotCount; s++) {
      slots.push(runSlot(s));
    }
    await Promise.all(slots);

    if (isCancelledRef.current) {
      setStatus('idle');
      appendLog('Verificación SBS detenida por el usuario.', 'warning');
    } else {
      setStatus('completed');
      appendLog('¡Verificación SBS completada para todos los trabajadores!', 'success');
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
    setStatus('idle');
    try {
      await stopSBS();
    } catch (_) {}
    appendLog('Deteniendo sesión del navegador SBS...', 'warning');
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
    elapsedSeconds,
    formattedTime,
    captchaAlert,
    dismissCaptcha: () => setCaptchaAlert(null),
    startScraping,
    pauseScraping,
    resumeScraping,
    stopScraping
  };
}
