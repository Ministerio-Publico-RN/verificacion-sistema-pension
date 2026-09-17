import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Clock, HelpCircle, ShieldCheck, UserPlus, Eye, RotateCw } from 'lucide-react';
import { splitRegimenPrevisional, compareWorkerFields } from '../../hooks/useWorkers';

export function WorkerRow({ worker, onSelectWorker, onRetryWorker, visibleColumns = {}, isInProgress = false, attemptNumber }) {
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
    if (isInProgress) {
      return (
        <span className="mpfn-badge badge-reviewing">
          <span className="mpfn-blink-dot" /> Revisando{attemptNumber ? ` #${attemptNumber}` : ''}
        </span>
      );
    }

    switch (worker.semaforo) {
      case 'coincidente':
        return (
          <span className="mpfn-badge badge-success">
            <CheckCircle2 size={13} /> Verificado
          </span>
        );
      case 'discrepancia': {
        const observaciones = (worker.semaforo_texto || '').split('\n').filter(Boolean);
        return (
          <div className="mpfn-badge-multiline badge-warning">
            <div className="badge-title"><AlertCircle size={13} /> Observado</div>
            {observaciones.length > 1 ? (
              <ul className="badge-list">
                {observaciones.map((obs, idx) => (
                  <li key={idx}>{obs}</li>
                ))}
              </ul>
            ) : (
              <div className="badge-sub">{observaciones[0] || worker.semaforo_texto}</div>
            )}
          </div>
        );
      }
      case 'latencia':
        return (
          <div className="semaforo-retry-wrap">
            <span className="mpfn-badge badge-danger">
              <Clock size={13} /> Falló al Consultar
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
      case 'snp':
        return (
          <span className="mpfn-badge badge-snp">
            <ShieldCheck size={13} /> Inscrito en SNP (ONP)
          </span>
        );
      case 'sin_afiliacion':
        return (
          <span className="mpfn-badge badge-neutral">
            <UserPlus size={13} /> Sin afiliación previa
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
  const { regimen, previsional } = splitRegimenPrevisional(worker);
  const match = compareWorkerFields(worker);

  const renderMatchIcon = (isMatch) =>
    isMatch ? (
      <CheckCircle2 size={12} className="icon-match" />
    ) : (
      <XCircle size={12} className="icon-mismatch" />
    );

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

      {visibleColumns.regimen !== false && (
        <td className="col-regimen">
          <span className="siga-regimen">{worker.regi_pens_codigo || worker.regimen_siga || worker.raw_data?.REGI_PENS_ || worker.raw_data?.REGI_PENS || regimen || '-'}</span>
        </td>
      )}

      {visibleColumns.previsional !== false && (
        <td className="col-previsional">
          <span className="siga-regimen">{worker.previsional_siga || previsional || worker.previsiona_siga || '-'}</span>
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
            <div className="sbs-cell sbs-cell-compare">
              <div className="sbs-cell-row">
                {match && renderMatchIcon(match.cusppMatch)}
                <span className="font-mono">{sbs.cuspp || '-'}</span>
              </div>
              <div className="sbs-cell-row">
                {match && renderMatchIcon(match.previsionalMatch)}
                <span>{sbs.afp || 'CONSULTADO'}</span>
              </div>
              <div className="sbs-cell-row">
                {match && renderMatchIcon(match.fechaMatch)}
                <span className="font-mono">{sbs.fecha_afiliacion || '-'}</span>
              </div>
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

      {visibleColumns.email === true && (
        <td className="col-email text-muted" title={worker.email || '-'}>
          {worker.email || '-'}
        </td>
      )}

      {visibleColumns.celular === true && (
        <td className="col-celular font-mono text-muted">
          {worker.celular || '-'}
        </td>
      )}

      {visibleColumns.origen === true && (
        <td className="col-origen text-muted">{worker.origen_planilla || '-'}</td>
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
