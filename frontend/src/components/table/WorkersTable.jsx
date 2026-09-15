import React from 'react';
import { WorkerRow } from './WorkerRow';
import { TableControls } from './TableControls';
import { Pagination } from './Pagination';
import { Inbox } from 'lucide-react';

export function WorkersTable({
  workers,
  paginatedWorkers,
  totalCount,
  filteredCount,
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
  visibleColumns = {},
  onToggleColumn,
  onRetryWorker,
  onRetryFailed,
  isRetryingFailed,
  failedCount = 0,
  inProgressDnis,
  attemptCounts
}) {
  // Contar columnas activas para el colSpan del estado vacío
  const activeColCount = Object.values(visibleColumns).filter(Boolean).length + 1;

  return (
    <section className="mpfn-card mpfn-table-section">
      <TableControls
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        statusFilter={statusFilter}
        onStatusChange={onStatusChange}
        onExport={onExport}
        onExportAfiliacion={onExportAfiliacion}
        totalCount={totalCount}
        filteredCount={filteredCount}
        visibleColumns={visibleColumns}
        onToggleColumn={onToggleColumn}
        onRetryFailed={onRetryFailed}
        isRetryingFailed={isRetryingFailed}
        failedCount={failedCount}
      />

      <div className="mpfn-table-responsive">
        <table className="mpfn-table">
          <thead>
            <tr>
              {visibleColumns.num !== false && <th className="col-num">#</th>}
              {visibleColumns.worker !== false && <th className="col-worker">Trabajador / DNI</th>}
              {visibleColumns.siga !== false && <th className="col-siga">Régimen SIGA</th>}
              {visibleColumns.afiliacion !== false && <th className="col-afiliacion">Fecha Afiliación</th>}
              {visibleColumns.cuspp !== false && <th className="col-cuspp">CUSPP</th>}
              {visibleColumns.sbs !== false && <th className="col-sbs">Consulta SBS</th>}
              {visibleColumns.semaforo !== false && <th className="col-semaforo">Semáforo de Validación</th>}
              {visibleColumns.afpnet === true && <th className="col-afpnet">Consulta AFPNet</th>}
              {visibleColumns.nacim === true && <th className="col-nacim">Fecha Nacimiento</th>}
              {visibleColumns.cargo === true && <th className="col-cargo">Cargo</th>}
              {visibleColumns.origen === true && <th className="col-origen">Origen</th>}
              <th className="col-actions">Acción</th>
            </tr>
          </thead>
          <tbody>
            {paginatedWorkers.length > 0 ? (
              paginatedWorkers.map((w) => (
                <WorkerRow
                  key={w.dni || w.num}
                  worker={w}
                  onSelectWorker={onSelectWorker}
                  onRetryWorker={onRetryWorker}
                  visibleColumns={visibleColumns}
                  isInProgress={inProgressDnis?.has(w.dni)}
                  attemptNumber={attemptCounts?.[w.dni]}
                />
              ))
            ) : (
              <tr>
                <td colSpan={activeColCount} className="mpfn-table-empty">
                  <div className="empty-state">
                    <div className="empty-icon-circle">
                      <Inbox size={38} className="text-muted" />
                    </div>
                    <h4>No se encontraron trabajadores</h4>
                    <p className="text-muted text-sm">
                      {searchQuery || statusFilter !== 'all'
                        ? 'No hay registros que coincidan con la búsqueda o filtro seleccionado.'
                        : 'El padrón de trabajadores se encuentra vacío.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        totalItems={filteredCount}
      />
    </section>
  );
}
