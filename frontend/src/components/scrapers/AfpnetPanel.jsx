import React from 'react';
import { Clock } from 'lucide-react';

export function AfpnetPanel() {
  return (
    <div className="mpfn-card mpfn-afpnet-panel is-disabled-feature">
      <div className="afpnet-header">
        <div>
          <div className="flex items-center gap-2">
            <h3>Módulo Masivo AFPNet</h3>
            <span className="mpfn-badge-soon">
              <Clock size={12} /> Próximamente
            </span>
          </div>
          <p className="scraper-subtitle">
            Cruce masivo por padrón de archivos oficiales de la Asociación de AFP
          </p>
        </div>

        <div className="afpnet-actions">
          <button
            className="mpfn-btn-outline"
            disabled
            title="Módulo en desarrollo para próxima versión"
            type="button"
          >
            Descargar Padrón
          </button>
          <button
            className="mpfn-btn-secondary"
            disabled
            title="Módulo en desarrollo para próxima versión"
            type="button"
          >
            Cargar Respuestas
          </button>
        </div>
      </div>
    </div>
  );
}
