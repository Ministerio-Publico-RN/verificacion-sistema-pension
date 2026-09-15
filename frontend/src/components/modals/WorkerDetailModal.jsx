import React from 'react';
import { X, User, Landmark, Building, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export function WorkerDetailModal({ worker, onClose }) {
  if (!worker) return null;

  const sbs = worker.sbs_resultado;
  const afpnet = worker.afpnet_resultado;

  return (
    <div className="mpfn-modal-backdrop" onClick={onClose}>
      <div className="mpfn-modal mpfn-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <User size={18} className="mpfn-text-gold" />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                {worker.apellidos_nombres || worker.nombre_completo || `Trabajador (DNI: ${worker.dni})`}
              </h3>
              <p className="scraper-subtitle" style={{ margin: '0.2rem 0 0 0', fontSize: '0.825rem', color: 'rgba(255, 255, 255, 0.75)' }}>
                DNI: <strong>{worker.dni}</strong>
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body detail-grid">
          <div className="detail-card">
            <h4><Landmark size={15} /> Información SIGA (Institucional)</h4>
            <div className="detail-rows">
              <div><strong>Régimen:</strong> {worker.previsiona_siga || 'No especificado'}</div>
              <div><strong>Fecha Afiliación:</strong> <span className="font-mono">{worker.afiliacion_siga || worker.fecha_afiliacion_siga || worker.fecha_afiliacion || '-'}</span></div>
              <div><strong>CUSPP:</strong> <span className="font-mono">{worker.cuspp_siga || worker.cuspp || 'Sin CUSPP'}</span></div>
              <div><strong>Fecha Nacimiento:</strong> {worker.fecha_nacimiento || '-'}</div>
              <div><strong>Cargo / Área:</strong> {worker.cargo || worker.dependencia || '-'}</div>
            </div>
          </div>

          <div className="detail-card">
            <h4><Building size={15} /> Resultado Oficial SBS</h4>
            {sbs ? (
              <div className="detail-rows">
                <div><strong>AFP Certificada:</strong> <span className="text-gold font-bold">{sbs.afp || 'DESCONOCIDO'}</span></div>
                <div><strong>Fecha Afiliación Oficial:</strong> <span className="font-mono">{sbs.fecha_afiliacion || '-'}</span></div>
                <div><strong>CUSPP Oficial:</strong> <span className="font-mono">{sbs.cuspp || '-'}</span></div>
                <div><strong>Situación:</strong> {sbs.situacion || '-'}</div>
                {sbs.mensaje && <div className="text-sm text-muted"><strong>Detalle:</strong> {sbs.mensaje}</div>}
              </div>
            ) : (
              <p className="text-muted">Aún no consultado en SBS.</p>
            )}
          </div>

          {afpnet && (
            <div className="detail-card full-width">
              <h4><ShieldCheck size={15} /> Resultado Oficial AFPNet</h4>
              <div className="detail-rows">
                <div><strong>Estado:</strong> {afpnet.estado}</div>
                <div><strong>AFP:</strong> {afpnet.afp || '-'}</div>
                <div><strong>CUSPP:</strong> {afpnet.cuspp || '-'}</div>
              </div>
            </div>
          )}

          <div className="detail-card full-width verdict-card">
            <h4>Veredicto de Validación</h4>
            <div className="verdict-content">
              {worker.semaforo === 'coincidente' && (
                <div className="text-success flex items-center gap-2 font-medium">
                  <CheckCircle2 size={18} /> Los registros de AFP, CUSPP y Fecha de Afiliación coinciden plenamente.
                </div>
              )}
              {worker.semaforo === 'discrepancia' && (
                <div className="text-danger flex flex-col gap-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle size={18} /> Se detectaron discrepancias entre SIGA y la entidad oficial:
                  </div>
                  <div className="text-sm mt-1 p-2 rounded bg-danger-subtle border border-danger-subtle font-mono whitespace-pre-line">
                    {worker.semaforo_texto}
                  </div>
                </div>
              )}
              {worker.semaforo === 'sin_afiliacion' && (
                <div className="text-neutral flex items-center gap-2 font-medium">
                  <ShieldCheck size={18} /> {worker.semaforo_texto || 'No registrado en AFP / Régimen SNP'}
                </div>
              )}
              {worker.semaforo === 'latencia' && (
                <div className="text-warning flex items-center gap-2 font-medium">
                  <AlertTriangle size={18} /> {worker.semaforo_texto || 'Error al consultar portal oficial'}
                </div>
              )}
              {(!worker.semaforo || worker.semaforo === 'sin_verificar') && (
                <div className="text-muted">El registro no ha sido verificado contra portales oficiales todavía.</div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="mpfn-btn-primary" onClick={onClose}>
            Cerrar Ficha
          </button>
        </div>
      </div>
    </div>
  );
}
