import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
  UserPlus,
  Users,
  ArrowLeft,
  Filter,
  RotateCw,
  Download,
  FileText,
  Info
} from 'lucide-react';
import { WorkersTable } from '../table/WorkersTable';
import { ExportMenu } from '../common/ExportMenu';

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
  onExportAfiliacion,
  onExportCierreAltas,
  isExportingCierreAltas = false,
  cierreAltasProgress = '',
  visibleColumns,
  onToggleColumn,
  onBackToVerification,
  onRetryWorker,
  onRetryFailed,
  isRetryingFailed
}) {
  const {
    total,
    consultados,
    iguales,
    discrepancias,
    errores,
    snpConfirmados = 0,
    sinAfiliacion = 0,
    pctIguales,
    afpBreakdown,
    pendientes = 0
  } = metrics;

  // Solo tiene sentido volver al motor SBS si queda algo por consultar o hubo fallas que
  // reintentar; si la ejecución terminó al 100% sin errores, no hay nada que hacer allí.
  const canGoBackToSbs = pendientes > 0 || errores > 0;

  const resultCards = [
    {
      id: 'all',
      title: 'Total Registros',
      value: total,
      icon: Users,
      badge: '100% Padrón',
      className: 'result-card-total'
    },
    {
      id: 'coincidente',
      title: 'Verificados',
      value: iguales,
      icon: CheckCircle2,
      badge: `${pctIguales}% Coincidencia`,
      className: 'result-card-valid'
    },
    {
      id: 'discrepancia',
      title: 'Observados',
      value: discrepancias,
      icon: AlertTriangle,
      badge: discrepancias > 0 ? 'Requiere Revisión' : 'Sin desalineación',
      className: 'result-card-alert'
    },
    {
      id: 'latencia',
      title: 'Fallaron al Consultar',
      value: errores,
      icon: AlertOctagon,
      badge: errores > 0 ? 'Reintentar' : 'Sin errores',
      className: 'result-card-error'
    },
    {
      id: 'snp',
      title: 'Inscritos en SNP (ONP)',
      value: snpConfirmados,
      icon: ShieldCheck,
      badge: 'ONP / D.L. 19990',
      className: 'result-card-snp'
    },
    {
      id: 'sin_afiliacion',
      title: 'Nuevos sin Afiliación',
      value: sinAfiliacion,
      icon: UserPlus,
      badge: 'Sin AFP / SNP',
      className: 'result-card-neutral'
    }
  ];

  // Proporciones para la barra visual
  const pctValid = total > 0 ? (iguales / total) * 100 : 0;
  const pctDiscrep = total > 0 ? (discrepancias / total) * 100 : 0;
  const pctErr = total > 0 ? (errores / total) * 100 : 0;
  const pctSnp = total > 0 ? (snpConfirmados / total) * 100 : 0;
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
          <div className="results-header-actions-row-top">
            <button
              className="mpfn-link-btn results-back-link"
              onClick={onBackToVerification}
              disabled={!canGoBackToSbs}
              title={canGoBackToSbs
                ? 'Volver a la verificación SBS para continuar o reintentar la verificación'
                : 'La verificación ya se completó al 100% sin errores; no hay nada pendiente en el motor SBS'}
              type="button"
            >
              <ArrowLeft size={14} /> Volver a la verificación SBS
            </button>
          </div>

          <div className="results-header-actions-row-bottom">
            {errores > 0 && onRetryFailed && (
              <button 
                className="mpfn-btn-warning" 
                onClick={onRetryFailed}
                disabled={isRetryingFailed}
                title="Reintentar todas las consultas fallidas en SBS"
                type="button"
              >
                <RotateCw size={15} className={isRetryingFailed ? 'animate-spin' : ''} />
                <span>Reejecutar los fallidos ({errores})</span>
              </button>
            )}

            {/* Botón oficial de Reporte de Afiliación siempre visible */}
            <button
              className="mpfn-btn-primary mpfn-btn-afiliacion-report"
              onClick={onExportAfiliacion}
              title="Descargar reporte de afiliación con formato oficial para trabajadores sin afiliación previa"
              type="button"
            >
              <Download size={15} />
              <span>Reporte Afiliación ({sinAfiliacion})</span>
            </button>

            {/* Botón Reporte del SPP (SBS) (Word con Ficha SBS) */}
            {onExportCierreAltas && (
              <button
                className="mpfn-btn-primary mpfn-btn-cierre-altas"
                onClick={onExportCierreAltas}
                disabled={isExportingCierreAltas}
                title="Descargar documento Word del SPP (SBS) con Nombre, DNI y foto de su ficha SBS"
                type="button"
                style={{
                  backgroundColor: '#2b579a',
                  borderColor: '#2b579a'
                }}
              >
                <FileText size={15} />
                <span>
                  {isExportingCierreAltas
                    ? `Generando Word (${cierreAltasProgress})...`
                    : 'Reporte del SPP (SBS)'}
                </span>
              </button>
            )}

            <ExportMenu onExport={onExport} label="Descargar Resultados" className="mpfn-btn-primary" />
          </div>
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
              title={card.badge}
            >
              <div className="result-card-top">
                <div className="result-card-icon-wrap">
                  <Icon size={16} />
                </div>
                {isSelected && <span className="result-filter-indicator"><Filter size={10} /></span>}
              </div>
              <div className="result-card-value">{card.value}</div>
              <span className="result-card-title">{card.title}</span>
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
            <span className="legend-item"><span className="dot dot-warning" /> Observados ({discrepancias})</span>
            <span className="legend-item"><span className="dot dot-danger" /> Fallaron al Consultar ({errores})</span>
            <span className="legend-item"><span className="dot dot-snp" /> Inscritos SNP ({snpConfirmados})</span>
            <span className="legend-item"><span className="dot dot-info" /> Sin Afiliación ({sinAfiliacion})</span>
          </div>
        </div>
        <div className="mpfn-segmented-bar">
          <div className="segment segment-success" style={{ width: `${pctValid}%` }} title={`Coincidentes: ${pctValid.toFixed(1)}%`} />
          <div className="segment segment-warning" style={{ width: `${pctDiscrep}%` }} title={`Observados: ${pctDiscrep.toFixed(1)}%`} />
          <div className="segment segment-danger" style={{ width: `${pctErr}%` }} title={`Fallaron al Consultar: ${pctErr.toFixed(1)}%`} />
          <div className="segment segment-snp" style={{ width: `${pctSnp}%` }} title={`Inscritos SNP: ${pctSnp.toFixed(1)}%`} />
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

      {/* Leyenda de Criterios de Clasificación Previsional */}
      <div
        className="mpfn-card mpfn-semaforo-legend-card"
        style={{
          padding: '10px 14px',
          marginBottom: '16px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '6px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#475569', fontWeight: 500, fontSize: '11.5px' }}>
          <Info size={14} color="#2563eb" />
          <span>Criterios de Clasificación Previsional (Leyenda):</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '10px', fontSize: '11.5px', lineHeight: 1.5 }}>
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '4px', borderLeft: '3px solid #0284c7', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', color: '#0369a1', fontWeight: 600 }}>
              <UserPlus size={13} color="#0284c7" />
              <span>Sin previa afiliación:</span>
            </div>
            <div style={{ color: '#475569', fontWeight: 400 }}>
              <div>1. No figura registrado en el portal SBS (NO REGISTRADO).</div>
              <div>2. Sin código CUSPP de 12 dígitos (se encuentra en blanco, con 'X' o texto como 'NO REGISTRADO').</div>
              <div>3. En columna PREVISIONA no registra "SNP" (incluso si tiene AFP tentativa como Profuturo).</div>
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '4px', borderLeft: '3px solid #7c3aed', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', color: '#6d28d9', fontWeight: 600 }}>
              <ShieldCheck size={13} color="#7c3aed" />
              <span>Inscrito en SNP (ONP):</span>
            </div>
            <div style={{ color: '#475569', fontWeight: 400 }}>
              <div>1. No figura registrado en el portal SBS (NO REGISTRADO).</div>
              <div>2. En columna PREVISIONA registra "SNP", "ONP" o régimen previsional "19990".</div>
            </div>
          </div>
        </div>
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
        onExportAfiliacion={onExportAfiliacion}
        visibleColumns={visibleColumns}
        onToggleColumn={onToggleColumn}
        onRetryWorker={onRetryWorker}
        onRetryFailed={onRetryFailed}
        isRetryingFailed={isRetryingFailed}
        failedCount={errores}
      />
    </div>
  );
}
