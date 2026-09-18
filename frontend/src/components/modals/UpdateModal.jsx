import React, { useState, useEffect, useCallback } from 'react';
import { X, ArrowUpCircle, RefreshCw, CheckCircle, AlertTriangle, Download, Sparkles, Power } from 'lucide-react';
import { checkAppUpdate, applyAppUpdate, finalizeAppUpdate } from '../../api/updateApi';

export function UpdateModal({ isOpen, onClose }) {
  const [status, setStatus] = useState('idle'); // idle | checking | available | up_to_date | downloading | downloaded | closing | error
  const [updateInfo, setUpdateInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);

  const handleCheck = useCallback(async () => {
    setStatus('checking');
    setErrorMsg('');
    try {
      const res = await checkAppUpdate();
      setUpdateInfo(res);
      if (res.error && !res.has_update) {
        setErrorMsg(`No se pudo verificar en GitHub: ${res.error}`);
        setStatus('error');
      } else if (res.has_update) {
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
    }
  }, [isOpen, handleCheck]);

  if (!isOpen) return null;

  const handleApply = async () => {
    setStatus('downloading');
    setDownloadProgress(8);
    setErrorMsg('');

    let current = 8;
    const progInterval = setInterval(() => {
      current += (94 - current) * 0.08;
      if (current > 94) current = 94;
      setDownloadProgress(current);
    }, 400);

    try {
      const res = await applyAppUpdate(updateInfo?.download_url);
      clearInterval(progInterval);
      if (res.success) {
        setDownloadProgress(100);
        setTimeout(() => {
          setStatus('downloaded');
        }, 400);
      } else {
        setErrorMsg(res.message || 'No se pudo descargar la actualización.');
        setStatus('error');
      }
    } catch (err) {
      clearInterval(progInterval);
      setErrorMsg(err.message || 'Error durante la descarga de la actualización.');
      setStatus('error');
    }
  };

  const handleFinalize = async (relaunch = false) => {
    setStatus('closing');
    try {
      await finalizeAppUpdate({ relaunch });
    } catch {
      // El backend cierra el proceso
    }
    setTimeout(() => {
      try {
        window.open('', '_self', '');
        window.close();
      } catch (_) {}
    }, 1200);
  };

  const handleCloseTab = () => {
    try {
      window.open('', '_self', '');
      window.close();
    } catch (_) {}
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
                Al presionar "Descargar e instalar", el sistema descargará la nueva versión. Luego podrá cerrar la aplicación con un solo clic para aplicar el cambio y volver a abrirla.
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

          {status === 'downloaded' && (
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', marginBottom: '14px' }}>
                <CheckCircle size={40} style={{ color: '#10b981' }} />
              </div>
              <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-main)', fontSize: '1.05rem', fontWeight: 600 }}>
                ¡Actualización descargada con éxito!
              </h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                La nueva versión se descargó y verificó correctamente. Elija una opción para aplicar los cambios:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '18px', maxWidth: '340px', margin: '18px auto 0' }}>
                <button
                  type="button"
                  className="mpfn-btn mpfn-btn-primary"
                  onClick={() => handleFinalize(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 16px', fontWeight: 600 }}
                >
                  <RefreshCw size={16} />
                  <span>Reiniciar y aplicar ahora</span>
                </button>
                <button
                  type="button"
                  className="mpfn-btn mpfn-btn-secondary"
                  onClick={() => handleFinalize(false)}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px 16px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                >
                  <Power size={16} />
                  <span>Cerrar aplicación únicamente</span>
                </button>
              </div>
            </div>
          )}

          {status === 'closing' && (
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', marginBottom: '14px' }}>
                <CheckCircle size={40} style={{ color: '#10b981' }} />
              </div>
              <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-main)', fontSize: '1.05rem', fontWeight: 600 }}>
                ¡Actualización en proceso!
              </h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                La aplicación anterior se está cerrando y el ejecutable está siendo actualizado a la última versión.
              </p>
              <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px', textAlign: 'left', fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '14px' }}>
                💡 <strong>Nota:</strong> Si eligió reiniciar, la nueva versión se abrirá automáticamente en unos segundos. De lo contrario, puede hacer doble clic en <code>VerificacionPrevisional-MPFN.exe</code>.
              </div>
              <div style={{ marginTop: '18px' }}>
                <button
                  type="button"
                  className="mpfn-btn mpfn-btn-secondary"
                  onClick={handleCloseTab}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <X size={14} />
                  <span>Cerrar esta pestaña</span>
                </button>
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
              <span>Descargar e instalar</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
