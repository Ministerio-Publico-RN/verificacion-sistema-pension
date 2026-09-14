import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Clock, HelpCircle, Eye, RotateCw } from 'lucide-react';

export function WorkerRow({ worker, onSelectWorker, onRetryWorker, visibleColumns = {} }) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async (e) => {
    e.stopPropagation();
    if (retrying || !onRetryWorker) return;
    setRetrying(true);
    try {
      await onRetryWorker(worker);
    } finally {
      setRetrying(false);
    }
  };

  const renderSemaforo = () => {
    switch (worker.semaforo) {
      case 'coincidente':
        return (
          <span className="mpfn-badge badge-success">
            <CheckCircle2 size={13} /> Verificado
          </span>
        );
      case 'discrepancia':
        return (
          <div className="mpfn-badge-multiline badge-danger">
            <div className="badge-title"><AlertCircle size={13} /> Discrepancia</div>
            <div className="badge-sub">{worker.semaforo_texto}</div>
          </div>
        );
      case 'latencia':
        return (
          <div className="semaforo-retry-wrap">
            <span className="mpfn-badge badge-warning">
              <Clock size={13} /> Error al consultar
            </span>
            <button
              className="mpfn-btn-icon-retry"
              title="Reintentar consulta en portal SBS"
              disabled={retrying}
              onClick={handleRetry}
              type="button"
            >
              <RotateCw size={12} className={retrying ? 'animate-spin' : ''} />
            </button>
          </div>
        );
      case 'sin_afiliacion':
        return (
          <span className="mpfn-badge badge-neutral">
            <HelpCircle size={13} /> {worker.semaforo_texto || 'No registrado en AFP'}
          </span>
        );
      default:
        return (
          <span className="mpfn-badge badge-muted">
            <Clock size={13} /> Sin verificar
          </span>
        );
    }
  };

  const sbs = worker.sbs_resultado;
  const afpnet = worker.afpnet_resultado;

  return (
    <tr className="mpfn-table-row" onClick={() => onSelectWorker(worker)}>
      {visibleColumns.num !== false && (
        <td className="col-num text-muted">{worker.num}</td>
      )}

      {visibleColumns.worker !== false && (
        <td className="col-worker">
          <div className="worker-name">{worker.apellidos_nombres || worker.nombre_completo}</div>
          <div className="worker-dni">DNI: {worker.dni}</div>
        </td>
      )}

      {visibleColumns.siga !== false && (
        <td className="col-siga">
          <span className="siga-regimen">{worker.previsiona_siga || '-'}</span>
        </td>
      )}

      {visibleColumns.afiliacion !== false && (
        <td className="col-afiliacion font-mono">
          {worker.afiliacion_siga || '-'}
        </td>
      )}

      {visibleColumns.cuspp !== false && (
        <td className="col-cuspp font-mono">{worker.cuspp_siga || sbs?.cuspp || '-'}</td>
      )}

      {visibleColumns.sbs !== false && (
        <td className="col-sbs">
          {sbs ? (
            <div className="sbs-cell">
              <span className={`afp-tag ${sbs.afiliado_spp ? 'is-afp' : 'is-none'}`}>
                {sbs.afp || 'CONSULTADO'}
              </span>
              {sbs.tiempo_seg && <span className="cell-time">({sbs.tiempo_seg}s)</span>}
            </div>
          ) : (
            <span className="text-muted">-</span>
          )}
        </td>
      )}

      {visibleColumns.semaforo !== false && (
        <td className="col-semaforo">{renderSemaforo()}</td>
      )}

      {visibleColumns.afpnet === true && (
        <td className="col-afpnet">
          {afpnet ? (
            <span className={`afp-tag ${afpnet.afiliado_spp ? 'is-afp' : 'is-none'}`}>
              {afpnet.afp || afpnet.estado}
            </span>
          ) : (
            <span className="text-muted">-</span>
          )}
        </td>
      )}

      {visibleColumns.nacim === true && (
        <td className="col-nacim font-mono">{worker.fecha_nacimiento || '-'}</td>
      )}

      {visibleColumns.cargo === true && (
        <td className="col-cargo text-muted">{worker.cargo || '-'}</td>
      )}

      <td className="col-actions">
        <button
          className="mpfn-icon-btn"
          title="Ver detalle del trabajador"
          onClick={(e) => {
            e.stopPropagation();
            onSelectWorker(worker);
          }}
          type="button"
        >
          <Eye size={15} />
        </button>
      </td>
    </tr>
  );
}
