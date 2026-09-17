import React from 'react';
import { FileCheck, Users, Clock, ArrowRight } from 'lucide-react';

export function ModeSelectScreen({ onSelectMode }) {
  return (
    <div className="mpfn-mode-select-wrap">
      <div className="mpfn-mode-select-header">
        <h2>¿Qué desea verificar hoy?</h2>
        <p className="text-muted">Seleccione el origen de los trabajadores a verificar contra el portal de la SBS</p>
      </div>

      <div className="mpfn-mode-select-grid">
        <div
          className="mpfn-mode-card"
          onClick={() => onSelectMode('altas')}
          role="button"
          tabIndex={0}
        >
          <div className="mpfn-mode-card-icon">
            <FileCheck size={32} />
          </div>
          <h3>Verificación de Altas</h3>
          <p className="mpfn-mode-card-desc">
            Carga un único reporte de Altas CAS del SIGA (formato con Régimen, CUSPP y Fecha de Afiliación).
          </p>
          <span className="mpfn-mode-card-cta">
            Continuar <ArrowRight size={15} />
          </span>
        </div>

        <div
          className="mpfn-mode-card"
          onClick={() => onSelectMode('pea')}
          role="button"
          tabIndex={0}
        >
          <div className="mpfn-mode-card-icon">
            <Users size={32} />
          </div>
          <h3>Verificación de PEA</h3>
          <p className="mpfn-mode-card-desc">
            Carga los 4 reportes de la planilla PEA: Pensionistas, Nombrados (276), CAS (1057) y Contratados (728).
          </p>
          <div className="mpfn-mode-card-stats">
            <span className="mpfn-stat-chip">
              <Users size={12} /> <strong>~20,000</strong>&nbsp;trabajadores
            </span>
            <span className="mpfn-stat-chip">
              <Clock size={12} /> <strong>~45&nbsp;h</strong>&nbsp;estimadas
            </span>
          </div>
          <span className="mpfn-mode-card-cta">
            Continuar <ArrowRight size={15} />
          </span>
        </div>
      </div>
    </div>
  );
}
