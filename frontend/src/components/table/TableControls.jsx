import React, { useState, useRef, useEffect } from 'react';
import { Search, Download, Columns3, Check, RotateCw } from 'lucide-react';
import { ExportMenu } from '../common/ExportMenu';

const RESULT_FILTER_VALUES = ['all', 'coincidente', 'discrepancia', 'latencia', 'snp', 'sin_afiliacion'];
const PADRON_FILTER_VALUES = ['filter_snp', 'filter_integra', 'filter_prima', 'filter_profuturo', 'filter_habitat', 'filter_blanco'];

export function TableControls({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  onExport,
  onExportAfiliacion,
  totalCount,
  filteredCount,
  visibleColumns,
  onToggleColumn,
  onRetryFailed,
  isRetryingFailed,
  failedCount = 0
}) {
  const [isColsOpen, setIsColsOpen] = useState(false);
  const colsRef = useRef(null);

  const columnOptions = [
    { key: 'num', label: 'N°' },
    { key: 'worker', label: 'Trabajador / DNI' },
    { key: 'regimen', label: 'Regimen previsional' },
    { key: 'previsional', label: 'Previsiona' },
    { key: 'afiliacion', label: 'Fecha Afiliación SIGA' },
    { key: 'cuspp', label: 'CUSPP SIGA' },
    { key: 'sbs', label: 'Consulta SBS' },
    { key: 'semaforo', label: 'Semáforo de Validación' },
    { key: 'afpnet', label: 'Consulta AFPNet' },
    { key: 'nacim', label: 'Fecha Nacimiento' },
    { key: 'cargo', label: 'Cargo / Dependencia' },
    { key: 'email', label: 'Correo (DIRE_EMAI_)' },
    { key: 'celular', label: 'Celular' },
    { key: 'origen', label: 'Origen (Planilla PEA)' }
  ];

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (colsRef.current && !colsRef.current.contains(e.target)) {
        setIsColsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="mpfn-table-toolbar">
      <div className="mpfn-search-wrap">
        <Search size={16} className="mpfn-search-icon" />
        <input
          type="text"
          placeholder="Buscar por DNI, nombres o CUSPP..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="mpfn-input-search"
        />
        {searchQuery && (
          <button
            className="mpfn-btn-clear"
            onClick={() => onSearchChange('')}
            type="button"
          >
            ×
          </button>
        )}
      </div>

      <div className="mpfn-toolbar-actions">
        <select
          value={RESULT_FILTER_VALUES.includes(statusFilter) ? statusFilter : 'all'}
          onChange={(e) => onStatusChange(e.target.value)}
          className="mpfn-select"
          title="Filtrar por resultado de la verificación"
        >
          <option value="all">Todos los registros ({totalCount})</option>
          <option value="coincidente">Verificados</option>
          <option value="discrepancia">Observados</option>
          <option value="latencia">Fallaron al Consultar</option>
          <option value="snp">Inscritos en SNP (ONP)</option>
          <option value="sin_afiliacion">Nuevos sin Afiliación</option>
        </select>

        <select
          value={PADRON_FILTER_VALUES.includes(statusFilter) ? statusFilter : 'all'}
          onChange={(e) => onStatusChange(e.target.value)}
          className="mpfn-select"
          title="Filtrar por composición del padrón SIGA"
        >
          <option value="all">Todos los padrones</option>
          <option value="filter_snp">Padrón: SNP (ONP)</option>
          <option value="filter_integra">Padrón: AFP Integra</option>
          <option value="filter_prima">Padrón: AFP Prima</option>
          <option value="filter_profuturo">Padrón: AFP Profuturo</option>
          <option value="filter_habitat">Padrón: AFP Habitat</option>
          <option value="filter_blanco">Padrón: En blanco</option>
        </select>

        {statusFilter === 'latencia' && failedCount > 0 && onRetryFailed && (
          <button
            type="button"
            className="mpfn-btn-warning"
            onClick={onRetryFailed}
            disabled={isRetryingFailed}
            title="Reintentar consultas fallidas en el portal SBS"
          >
            <RotateCw size={14} className={isRetryingFailed ? 'animate-spin' : ''} />
            <span>Reintentar fallidos ({failedCount})</span>
          </button>
        )}

        {/* Selector de Columnas */}
        <div className="mpfn-col-picker-wrap" ref={colsRef}>
          <button
            type="button"
            className={`mpfn-btn-outline ${isColsOpen ? 'is-active' : ''}`}
            onClick={() => setIsColsOpen(!isColsOpen)}
            title="Seleccionar columnas a mostrar y exportar"
          >
            <Columns3 size={15} /> Columnas
          </button>

          {isColsOpen && (
            <div className="mpfn-col-dropdown">
              <div className="dropdown-title">Columnas Visibles</div>
              {columnOptions.map((col) => (
                <label key={col.key} className="col-checkbox-label">
                  <input
                    type="checkbox"
                    checked={visibleColumns[col.key] !== false}
                    onChange={() => onToggleColumn(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <ExportMenu onExport={onExport} label="Exportar" />
      </div>
    </div>
  );
}
