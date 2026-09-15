import React, { useEffect, useState } from 'react';
import { X, History, Trash2, PlayCircle, Eye, Loader2 } from 'lucide-react';
import { listExecutions, deleteExecution } from '../../api/sigaApi';

const TIPO_LABEL = { altas: 'Altas CAS', pea: 'PEA' };

function formatFecha(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('es-PE', { hour12: false });
  } catch (_) {
    return iso;
  }
}

export function HistoryPanel({ isOpen, onClose, onOpenExecution }) {
  const [executions, setExecutions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const reload = async () => {
    setIsLoading(true);
    try {
      const res = await listExecutions();
      setExecutions(res.executions || []);
    } catch (_) {
      setExecutions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) reload();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta ejecución del historial? Esta acción no se puede deshacer.')) return;
    setBusyId(id);
    try {
      await deleteExecution(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mpfn-modal-backdrop" onClick={onClose}>
      <div className="mpfn-modal mpfn-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <History size={18} />
            <h3>Historial de Ejecuciones</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body mpfn-history-body">
          {isLoading && (
            <div className="mpfn-history-loading">
              <Loader2 size={22} className="mpfn-spin" /> Cargando...
            </div>
          )}

          {!isLoading && executions.length === 0 && (
            <p className="text-muted text-sm">Todavía no hay ejecuciones registradas.</p>
          )}

          {!isLoading && executions.map((ex) => {
            const pct = ex.total > 0 ? Math.round((ex.consultados / ex.total) * 100) : 0;
            return (
              <div key={ex.id} className="mpfn-history-row">
                <div className="mpfn-history-row-info">
                  <div className="mpfn-history-row-top">
                    <span className={`mpfn-history-badge ${ex.estado === 'en_curso' ? 'is-en-curso' : 'is-completado'}`}>
                      {ex.estado === 'en_curso' ? 'En curso' : 'Completado'}
                    </span>
                    <span className="mpfn-history-tipo">{TIPO_LABEL[ex.tipo] || ex.tipo}</span>
                  </div>
                  <span className="mpfn-history-fecha">Iniciado: {formatFecha(ex.fecha_inicio)}</span>
                  <span className="mpfn-history-progreso">{ex.consultados} / {ex.total} consultados ({pct}%)</span>
                </div>

                <div className="mpfn-history-row-actions">
                  <button
                    className="mpfn-btn-outline"
                    onClick={() => onOpenExecution(ex)}
                    type="button"
                  >
                    {ex.estado === 'en_curso' ? <><PlayCircle size={14} /> Continuar</> : <><Eye size={14} /> Ver</>}
                  </button>
                  <button
                    className="mpfn-btn-icon-subtle"
                    onClick={() => handleDelete(ex.id)}
                    disabled={busyId === ex.id}
                    title="Eliminar del historial"
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
