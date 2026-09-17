import React, { useState, useEffect, useCallback } from 'react';
import { X, ArrowUpCircle, RefreshCw, CheckCircle, AlertTriangle, Download, Sparkles } from 'lucide-react';
import { checkAppUpdate, applyAppUpdate } from '../../api/updateApi';

export function UpdateModal({ isOpen, onClose }) {
  const [status, setStatus] = useState('idle'); // idle | checking | available | up_to_date | downloading | restarting | error
  const [updateInfo, setUpdateInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [countdown, setCountdown] = useState(5);
  const [reconnectAttempts, setReconnectAttempts] = useState(1);
  const [isReconnected, setIsReconnected] = useState(false);
  const [reconnectFailed, setReconnectFailed] = useState(false);

  const handleCheck = useCallback(async () => {
    setStatus('checking');
    setErrorMsg('');
    try {
      const res = await checkAppUpdate();
      setUpdateInfo(res);
      if (res.has_update) {
        setStatus('available');
      } else {
        setStatus('up_to_date');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error al conectar con el servidor de actualizaciones.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      handleCheck();
    } else {
      setStatus('idle');
      setErrorMsg('');
      setDownloadProgress(0);
      setIsReconnected(false);
    }
  }, [isOpen, handleCheck]);

  // Manejo de reinicio y reconexión automática
  useEffect(() => {
    if (status !== 'restarting') return;

    let timer = null;
    let pollInterval = null;
    let counter = 5;
    setCountdown(5);
    setReconnectAttempts(1);
    setIsReconnected(false);
    setReconnectFailed(false);

    timer = setInterval(() => {
      counter -= 1;
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      if (counter <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    const pollTimer = setTimeout(() => {
      let attempts = 0;
      pollInterval = setInterval(async () => {
        attempts += 1;
        setReconnectAttempts(attempts);
        try {
          const res = await fetch('/api/status', { cache: 'no-store' });
          if (res.ok) {
            clearInterval(pollInterval);
            setIsReconnected(true);
            setTimeout(() => {
              window.location.reload();
            }, 1200);
          }
        } catch {
          if (attempts >= 40) {
            clearInterval(pollInterval);
            setReconnectFailed(true);
          }
        }
      }, 1500);
    }, 2000);

    return () => {
      if (timer) clearInterval(timer);
      if (pollTimer) clearTimeout(pollTimer);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [status]);

  if (!isOpen) return null;

  const handleApply = async () => {
    setStatus('downloading');
    setDownloadProgress(8);
    setErrorMsg('');

    let current = 8;
    const progInterval = setInterval(() => {
      current += (92 - current) * 0.08;
      if (current > 92) current = 92;
      setDownloadProgress(current);
    }, 400);

    try {
      const res = await applyAppUpdate(updateInfo?.download_url);
      clearInterval(progInterval);
      if (res.success) {
        setDownloadProgress(100);
        setTimeout(() => {
          setStatus('restarting');
        }, 400);
      } else {
        setErrorMsg(res.message || 'No se pudo aplicar la actualización.');
        setStatus('error');
      }
    } catch (err) {
      clearInterval(progInterval);
      setErrorMsg(err.message || 'Error durante la descarga de la actualización.');
      setStatus('error');
    }
  };

  return (
    <div className="mpfn-modal-backdrop" onClick={status === 'downloading' ? undefined : onClose}>
      <div className="mpfn-modal" style={{ maxWidth: '520px', color: 'var(--text-main)', background: 'var(--bg-card)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <ArrowUpCircle size={20} className="mpfn-text-gold" />
            <h3 style={{ margin: 0, color: '#ffffff' }}>Actualizaciones del Sistema</h3>
          </div>
          {status !== 'downloading' && (
            <button className="modal-close-btn" onClick={onClose} type="button">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="modal-body" style={{ padding: '20px', color: 'var(--text-main)' }}>
          {status === 'checking' && (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <RefreshCw size={36} className="mpfn-text-gold" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-main)' }}>Buscando nuevas versiones...</p>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Verificando compatibilidad del ejecutable</span>
            </div>
          )}

          {status === 'up_to_date' && (
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', marginBottom: '14px' }}>
                <CheckCircle size={36} style={{ color: '#10b981' }} />
              </div>
              <h4 style={{ margin: '0 0 8px 0', fontWeight: 600, color: 'var(--text-main)' }}>¡El sistema está actualizado!</h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Cuentas con la versión más reciente instalada (<strong>v{updateInfo?.current_version || '1.0.0'}</strong>).
              </p>
              <button
                type="button"
                className="mpfn-btn mpfn-btn-secondary"
                onClick={handleCheck}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: '0 auto' }}
              >
                <RefreshCw size={14} />
                <span>Volver a comprobar</span>
              </button>
            </div>
          )}

          {status === 'available' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', backgroundColor: 'rgba(217, 119, 6, 0.1)', borderRadius: '8px', border: '1px solid rgba(217, 119, 6, 0.3)', marginBottom: '16px' }}>
                <Sparkles size={24} style={{ color: '#d97706', flexShrink: 0 }} />
                <div>
                  <strong style={{ color: '#d97706', display: 'block', fontSize: '0.95rem' }}>
                    Nueva versión disponible: v{updateInfo?.latest_version}
                  </strong>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Versión actual: v{updateInfo?.current_version} {updateInfo?.size_mb ? `• Tamaño: ${updateInfo.size_mb} MB` : ''}
                  </span>
                </div>
              </div>

              {updateInfo?.release_notes && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                    Novedades de la versión:
                  </label>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', padding: '10px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem', whiteSpace: 'pre-wrap', color: 'var(--text-main)' }}>
                    {updateInfo.release_notes}
                  </div>
                </div>
              )}

              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                Al presionar "Instalar actualización", el sistema descargará el nuevo archivo <code>.exe</code>, reemplazará el ejecutable actual y se reiniciará automáticamente.
              </p>
            </div>
          )}

          {status === 'downloading' && (
            <div style={{ textAlign: 'center', padding: '24px 10px' }}>
              <Download size={36} className="mpfn-text-gold" style={{ animation: 'bounce 1s infinite', marginBottom: '12px' }} />
              <h4 style={{ margin: '0 0 6px 0', color: 'var(--text-main)' }}>Descargando actualización...</h4>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                Descargando paquete desde GitHub ({updateInfo?.size_mb || '~40'} MB). Esto puede demorar entre 10 y 30 segundos.
              </p>
              
              <div style={{ width: '100%', height: '10px', backgroundColor: '#334155', borderRadius: '9999px', overflow: 'hidden', margin: '0 0 8px', position: 'relative' }}>
                <div style={{ width: `${downloadProgress}%`, height: '100%', background: 'linear-gradient(90deg, #d97706, #fbbf24)', borderRadius: '9999px', transition: 'width 0.3s ease-out' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>Descarga en progreso...</span>
                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{Math.round(downloadProgress)}%</span>
              </div>
            </div>
          )}

          {status === 'restarting' && (
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              {isReconnected ? (
                <CheckCircle size={40} style={{ color: '#10b981', marginBottom: '14px' }} />
              ) : reconnectFailed ? (
                <AlertTriangle size={40} style={{ color: '#f59e0b', marginBottom: '14px' }} />
              ) : (
                <RefreshCw size={40} className="mpfn-text-gold" style={{ animation: 'spin 1.2s linear infinite', marginBottom: '14px' }} />
              )}
              <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-main)', fontSize: '1.05rem' }}>
                {isReconnected
                  ? '¡Sistema actualizado con éxito!'
                  : reconnectFailed
                    ? 'Actualización aplicada'
                    : '¡Descarga completada! Reiniciando...'}
              </h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {isReconnected
                  ? 'El nuevo ejecutable ya está activo. Recargando la aplicación...'
                  : reconnectFailed
                    ? 'El archivo se actualizó correctamente. Si el sistema ya abrió en otra ventana o pestaña, puede cerrar esta ventana o pulsar Recargar ahora.'
                    : countdown > 0
                      ? `Reemplazando ejecutable y reiniciando el servicio en ${countdown} segundos...`
                      : `Esperando inicio del nuevo sistema... (intento ${reconnectAttempts}/40)`
                }
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  className="mpfn-btn mpfn-btn-secondary"
                  onClick={onClose}
                >
                  Cerrar
                </button>
                {(isReconnected || reconnectFailed) && (
                  <button
                    type="button"
                    className="mpfn-btn mpfn-btn-primary"
                    onClick={() => window.location.reload()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <RefreshCw size={14} />
                    <span>Recargar ahora</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {status === 'error' && (
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', marginBottom: '14px' }}>
                <AlertTriangle size={36} style={{ color: '#ef4444' }} />
              </div>
              <h4 style={{ margin: '0 0 8px 0', color: '#ef4444' }}>No se pudo completar la operación</h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                {errorMsg}
              </p>
              <button
                type="button"
                className="mpfn-btn mpfn-btn-primary"
                onClick={handleCheck}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: '0 auto' }}
              >
                <RefreshCw size={14} />
                <span>Reintentar comprobación</span>
              </button>
            </div>
          )}
        </div>

        {status === 'available' && (
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', borderTop: '1px solid var(--border-color)' }}>
            <button
              type="button"
              className="mpfn-btn mpfn-btn-secondary"
              onClick={onClose}
            >
              Más tarde
            </button>
            <button
              type="button"
              className="mpfn-btn mpfn-btn-primary"
              onClick={handleApply}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={16} />
              <span>Instalar actualización</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
