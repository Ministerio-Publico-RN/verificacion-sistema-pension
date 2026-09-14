import React from 'react';
import { Play, Pause, Square, Settings, Globe, ShieldAlert, CheckCircle, Eye, EyeOff, FileCheck, ArrowRight } from 'lucide-react';

export function SbsPanel({
  status,
  progress,
  activeWindows,
  headless,
  onToggleHeadless,
  onStart,
  onPause,
  onResume,
  onStop,
  onOpenConfig,
  totalWorkers,
  captchaAlert,
  onGoToResults
}) {
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';

  return (
    <div className="mpfn-card mpfn-scraper-panel">
      <div className="scraper-header">
        <div className="scraper-title-group">
          <Globe size={18} className="mpfn-text-gold" />
          <div>
            <h3>Consultas en Portal SBS</h3>
            <p className="scraper-subtitle">Superintendencia de Banca, Seguros y AFP</p>
          </div>
        </div>

        <div className="scraper-actions">
          {/* Toggle rápido de ventana visible o segundo plano */}
          <button
            className={`mpfn-btn-toggle-visibility ${!headless ? 'is-visible' : 'is-headless'}`}
            onClick={onToggleHeadless}
            title={!headless ? 'Modo actual: Ventana visible en pantalla. Clic para cambiar a segundo plano.' : 'Modo actual: Segundo plano silencioso. Clic para mostrar ventana visible.'}
            type="button"
          >
            {!headless ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>{!headless ? 'Ventana Visible' : 'Segundo Plano'}</span>
          </button>

          {activeWindows > 0 && (
            <span className="window-badge">
              {activeWindows} {activeWindows === 1 ? 'ventana' : 'ventanas'}
            </span>
          )}

          {!isRunning && !isPaused && (
            <button
              className="mpfn-btn-primary"
              disabled={totalWorkers === 0}
              onClick={onStart}
              type="button"
            >
              <Play size={15} /> Iniciar Verificación SBS
            </button>
          )}

          {isRunning && (
            <button className="mpfn-btn-warning" onClick={onPause} type="button">
              <Pause size={15} /> Pausar
            </button>
          )}

          {isPaused && (
            <button className="mpfn-btn-success" onClick={onResume} type="button">
              <Play size={15} /> Reanudar
            </button>
          )}

          {(isRunning || isPaused) && (
            <button className="mpfn-btn-danger" onClick={onStop} type="button">
              <Square size={15} /> Detener
            </button>
          )}

          {(progress.current > 0 || isCompleted) && onGoToResults && (
            <button
              className="mpfn-btn-outline mpfn-btn-results-link"
              onClick={onGoToResults}
              title="Ir al Paso 4 para ver métricas de semáforos, discrepancias y exportar"
              type="button"
            >
              <FileCheck size={14} className="text-gold" />
              <span>Ver Resultados (Paso 4)</span>
              <ArrowRight size={13} />
            </button>
          )}

          <button
            className="mpfn-btn-icon-subtle"
            onClick={onOpenConfig}
            title="Configuración de tiempos y ventanas concurrentes"
            type="button"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {(isRunning || isPaused || isCompleted || progress.total > 0) && (
        <div className="scraper-progress-section">
          <div className="progress-labels">
            <span>
              Progreso: <strong>{progress.current}</strong> / {progress.total} consultas ({progress.percent}%)
            </span>
            <span className="status-label">
              {isRunning && <span className="text-warning">En ejecución...</span>}
              {isPaused && <span className="text-muted">En pausa</span>}
              {isCompleted && <span className="text-success"><CheckCircle size={13} /> Finalizado</span>}
            </span>
          </div>
          <div className="mpfn-progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
        </div>
      )}

      {captchaAlert && (
        <div className="mpfn-captcha-banner">
          <ShieldAlert size={18} className="text-danger" />
          <span>
            <strong>Atención:</strong> Se requiere resolver el desafío reCAPTCHA en la ventana del navegador abierta para continuar.
          </span>
        </div>
      )}
    </div>
  );
}
