import { useState, useRef, useCallback, useEffect } from 'react';
import { verifyWorkerSBS, stopSBS, getSbsConfig, saveSbsConfig } from '../api/sbsApi';

export function useSbsStream({ onWorkerUpdate, onLog }) {
  const [status, setStatus] = useState('idle'); // idle | running | paused | completed
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [activeWindows, setActiveWindows] = useState(1);
  const [headless, setHeadless] = useState(false);
  const [captchaAlert, setCaptchaAlert] = useState(null);

  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);

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
    setStatus('running');
    setCaptchaAlert(null);

    const total = workersToQuery.length;
    setProgress({ current: 0, total, percent: 0 });
    appendLog(`Iniciando motor SBS para ${total} trabajadores...`, 'info');

    // Cargar config actual de SBS
    let delayMs = 1000;
    try {
      const cfg = await getSbsConfig();
      if (cfg?.delay_between !== undefined) {
        delayMs = Math.round(Number(cfg.delay_between) * 1000);
      }
      if (cfg?.concurrency) setActiveWindows(cfg.concurrency);
    } catch (_) {}

    let completed = 0;

    for (let i = 0; i < workersToQuery.length; i++) {
      if (isCancelledRef.current) break;
      await waitIfPaused();
      if (isCancelledRef.current) break;

      const worker = workersToQuery[i];
      const dni = worker.dni;
      const nombre = worker.apellidos_nombres || worker.nombre_completo || dni;

      appendLog(`[${i + 1}/${total}] Consultando SBS para: ${nombre} (${dni})...`, 'info');

      try {
        const sbsRes = await verifyWorkerSBS(worker);

        completed++;
        const pct = Math.round((completed / total) * 100);
        setProgress({ current: completed, total, percent: pct });

        onWorkerUpdate?.(dni, {
          sbs_resultado: sbsRes,
          sbs_consultado: true
        });

        // Detección de Captcha
        if (sbsRes?.estado_sbs === 'RECAPTCHA_CHALLENGE' || sbsRes?.afp === 'RETO RECAPTCHA') {
          setCaptchaAlert({ dni, name: nombre, workerId: sbsRes.worker_id || 1 });
          appendLog(`[ALERTA] Desafío reCAPTCHA detectado en DNI ${dni}. Resuelva en el navegador si está visible.`, 'warning');
        } else {
          setCaptchaAlert(null);
          const afpText = sbsRes?.afp || (sbsRes?.afiliado_spp ? 'ENCONTRADO' : 'NO REGISTRADO');
          appendLog(`[OK] DNI ${dni} -> ${afpText} (${sbsRes?.tiempo_seg || 0}s)`, 'success');
        }
      } catch (err) {
        completed++;
        setProgress({ current: completed, total, percent: Math.round((completed / total) * 100) });
        appendLog(`[ERROR] DNI ${dni}: ${err.message}`, 'error');
      }

      // Tiempo de espera entre consultas
      if (i < workersToQuery.length - 1 && !isCancelledRef.current) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

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
    captchaAlert,
    dismissCaptcha: () => setCaptchaAlert(null),
    startScraping,
    pauseScraping,
    resumeScraping,
    stopScraping
  };
}
