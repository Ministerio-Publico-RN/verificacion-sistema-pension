import React from 'react';
import { Play, Pause, Square, Settings, Globe, CheckCircle, FileCheck, ArrowRight, Clock, PlayCircle, RotateCw } from 'lucide-react';

export function SbsPanel({
  status,
  progress,
  elapsedTime,
  onStart,
  onPause,
  onResume,
  onStop,
  onContinue,
  onOpenConfig,
  totalWorkers,
  onGoToResults,
  onRetryFailed,
  failedCount = 0
}) {
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isStopped = status === 'stopped';
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
          {!isRunning && !isPaused && !isStopped && !isCompleted && (
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

          {isStopped && onContinue && (
            <button className="mpfn-btn-primary" onClick={onContinue} type="button">
              <PlayCircle size={15} /> Continuar ejecución
            </button>
          )}

          {isCompleted && failedCount > 0 && onRetryFailed && (
            <button className="mpfn-btn-warning" onClick={onRetryFailed} type="button">
              <RotateCw size={14} /> Ejecutar todos los fallidos ({failedCount})
            </button>
          )}

          {(isCompleted || isStopped) && onGoToResults && (
            <button
              className="mpfn-btn-outline mpfn-btn-results-link"
              onClick={onGoToResults}
              title="Ver métricas de semáforos, discrepancias y exportar"
              type="button"
            >
              <FileCheck size={14} className="text-gold" />
              <span>Ver Resultados</span>
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

      {(isRunning || isPaused || isStopped || isCompleted || progress.total > 0) && (
        <div className="scraper-progress-section">
          <div className="progress-labels">
            <span>
              Progreso: <strong>{progress.current}</strong> / {progress.total} consultas ({progress.percent}%)
            </span>
            <div className="progress-meta-right">
              <span className="status-label">
                {isStopped && <span className="text-muted">Detenido</span>}
                {isPaused && <span className="text-muted">En pausa</span>}
                {isCompleted && <span className="text-success"><CheckCircle size={13} /> Finalizado</span>}
              </span>
              <span className="execution-timer">
                <Clock size={13} /> {isCompleted ? 'Tiempo total: ' : 'Tiempo: '} <strong>{elapsedTime || '00:00'}</strong>
              </span>
            </div>
          </div>
          <div className="mpfn-progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
