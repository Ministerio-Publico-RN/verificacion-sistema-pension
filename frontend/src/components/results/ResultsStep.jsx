import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  ShieldCheck, 
  Users, 
  FileSpreadsheet, 
  FileText, 
  ArrowLeft,
  Filter
} from 'lucide-react';
import { WorkersTable } from '../table/WorkersTable';

export function ResultsStep({
  workers,
  filteredWorkers,
  paginatedWorkers,
  metrics,
  fileName,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  onSelectWorker,
  onExport,
  visibleColumns,
  onToggleColumn,
  onBackToVerification
}) {
  const {
    total,
    consultados,
    iguales,
    discrepancias,
    errores,
    sinAfiliacion,
    pctIguales,
    afpBreakdown
  } = metrics;

  const resultCards = [
    {
      id: 'all',
      title: 'Total Registros',
      value: total,
      subtext: `${consultados} consultados en SBS`,
      icon: Users,
      badge: '100% Padrón',
      className: 'result-card-total'
    },
    {
      id: 'coincidente',
      title: 'Validados (Iguales)',
      value: iguales,
      subtext: 'SIGA y SBS coinciden',
      icon: CheckCircle2,
      badge: `${pctIguales}% Coincidencia`,
      className: 'result-card-valid'
    },
    {
      id: 'discrepancia',
      title: 'Discrepancias',
      value: discrepancias,
      subtext: 'Régimen o AFP no coincide',
      icon: AlertTriangle,
      badge: discrepancias > 0 ? 'Requiere Revisión' : 'Sin desalineación',
      className: 'result-card-alert'
    },
    {
      id: 'latencia',
      title: 'Con Errores / Observados',
      value: errores,
      subtext: 'Retos Captcha o latencia SBS',
      icon: AlertOctagon,
      badge: errores > 0 ? 'Reintentar' : 'Sin errores',
      className: 'result-card-error'
    },
    {
      id: 'sin_afiliacion',
      title: 'Sin Afiliación SPP',
      value: sinAfiliacion,
      subtext: 'Confirmado no registrado (SNP)',
      icon: ShieldCheck,
      badge: 'ONP / Sin AFP',
      className: 'result-card-neutral'
    }
  ];

  // Proporciones para la barra visual
  const pctValid = total > 0 ? (iguales / total) * 100 : 0;
  const pctDiscrep = total > 0 ? (discrepancias / total) * 100 : 0;
  const pctErr = total > 0 ? (errores / total) * 100 : 0;
  const pctSinAfil = total > 0 ? (sinAfiliacion / total) * 100 : 0;

  return (
    <div className="mpfn-results-view">
      {/* Barra de cabecera con acciones de exportación */}
      <div className="mpfn-results-header mpfn-card">
        <div className="results-header-info">
          <div className="results-tag">Paso 4 • Resultados Finales</div>
          <h2>Consolidado de Verificación Previsional</h2>
          <p className="results-subtitle">
            Archivo evaluado: <strong>{fileName || 'Padrón Cargado'}</strong> • {consultados} de {total} procesados
          </p>
        </div>

        <div className="results-header-actions">
          <button 
            className="mpfn-btn-outline" 
            onClick={onBackToVerification}
            type="button"
          >
            <ArrowLeft size={15} /> Volver al Motor SBS
          </button>
          <button 
            className="mpfn-btn-primary" 
            onClick={() => onExport('xlsx')}
            type="button"
          >
            <FileSpreadsheet size={15} /> Descargar Excel (.xlsx)
          </button>
          <button 
            className="mpfn-btn-secondary" 
            onClick={() => onExport('csv')}
            type="button"
          >
            <FileText size={15} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Grid de Cards Interactivas de Semáforos */}
      <div className="mpfn-results-grid">
        {resultCards.map((card) => {
          const Icon = card.icon;
          const isSelected = statusFilter === card.id;

          return (
            <div
              key={card.id}
              className={`mpfn-result-card ${card.className} ${isSelected ? 'is-selected' : ''}`}
              onClick={() => onStatusChange(card.id)}
              role="button"
              tabIndex={0}
            >
              <div className="result-card-top">
                <span className="result-card-title">{card.title}</span>
                <span className="result-card-badge">{card.badge}</span>
              </div>
              <div className="result-card-main">
                <div className="result-card-value">{card.value}</div>
                <div className="result-card-icon-wrap">
                  <Icon size={22} />
                </div>
              </div>
              <div className="result-card-footer">
                <span className="result-card-subtext">{card.subtext}</span>
                {isSelected && <span className="result-filter-indicator"><Filter size={11} /> Filtrado</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Barra de Distribución Visual de Semáforos */}
      <div className="mpfn-card mpfn-distribution-card">
        <div className="distribution-header">
          <span className="distribution-title">Distribución Visual de Validación</span>
          <div className="distribution-legend">
            <span className="legend-item"><span className="dot dot-success" /> Coincidentes ({iguales})</span>
            <span className="legend-item"><span className="dot dot-warning" /> Discrepancias ({discrepancias})</span>
            <span className="legend-item"><span className="dot dot-danger" /> Errores ({errores})</span>
            <span className="legend-item"><span className="dot dot-info" /> Sin Afiliación ({sinAfiliacion})</span>
          </div>
        </div>
        <div className="mpfn-segmented-bar">
          <div className="segment segment-success" style={{ width: `${pctValid}%` }} title={`Coincidentes: ${pctValid.toFixed(1)}%`} />
          <div className="segment segment-warning" style={{ width: `${pctDiscrep}%` }} title={`Discrepancias: ${pctDiscrep.toFixed(1)}%`} />
          <div className="segment segment-danger" style={{ width: `${pctErr}%` }} title={`Errores: ${pctErr.toFixed(1)}%`} />
          <div className="segment segment-info" style={{ width: `${pctSinAfil}%` }} title={`Sin Afiliación: ${pctSinAfil.toFixed(1)}%`} />
        </div>

        {/* Desglose de AFPs encontradas por la SBS */}
        {afpBreakdown && (
          <div className="afp-chips-row">
            <span className="afp-chips-label">Entidades detectadas en SBS:</span>
            <span className="afp-chip">Integra: <strong>{afpBreakdown.integra}</strong></span>
            <span className="afp-chip">Prima: <strong>{afpBreakdown.prima}</strong></span>
            <span className="afp-chip">Profuturo: <strong>{afpBreakdown.profuturo}</strong></span>
            <span className="afp-chip">Hábitat: <strong>{afpBreakdown.habitat}</strong></span>
            <span className="afp-chip">No Registrado: <strong>{afpBreakdown.noRegistrado}</strong></span>
          </div>
        )}
      </div>

      {/* Tabla Completa con Filtros y Columnas Visibles */}
      <WorkersTable
        workers={workers}
        paginatedWorkers={paginatedWorkers}
        totalCount={workers.length}
        filteredCount={filteredWorkers.length}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        statusFilter={statusFilter}
        onStatusChange={onStatusChange}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        onSelectWorker={onSelectWorker}
        onExport={onExport}
        visibleColumns={visibleColumns}
        onToggleColumn={onToggleColumn}
      />
    </div>
  );
}
