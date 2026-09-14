import React, { useState, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { WorkflowStepper } from './components/layout/WorkflowStepper';
import { FileDropzone } from './components/uploader/FileDropzone';
import { SbsPanel } from './components/scrapers/SbsPanel';
import { ResultsStep } from './components/results/ResultsStep';
import { WorkersTable } from './components/table/WorkersTable';
import { SbsConfigModal } from './components/modals/SbsConfigModal';
import { WorkerDetailModal } from './components/modals/WorkerDetailModal';
import { LogConsole } from './components/layout/LogConsole';
import { useWorkers } from './hooks/useWorkers';
import { useSbsStream } from './hooks/useSbsStream';
import { exportVisibleReport, exportAfiliacionReport } from './api/exportApi';
import { verifyWorkerSBS } from './api/sbsApi';
import { ArrowRight } from 'lucide-react';

export function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [logs, setLogs] = useState([]);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);

  // Columnas visibles (Consulta AFPNet oculta por defecto, Fecha de Afiliación visible)
  const [visibleColumns, setVisibleColumns] = useState({
    num: true,
    worker: true,
    siga: true,
    afiliacion: true,
    cuspp: true,
    sbs: true,
    semaforo: true,
    afpnet: false,
    nacim: false,
    cargo: false
  });

  const toggleColumn = useCallback((key) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const addLog = useCallback((log) => {
    setLogs(prev => [...prev.slice(-150), log]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const {
    workers,
    filteredWorkers,
    paginatedWorkers,
    fileName,
    fileMeta,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    metrics,
    setWorkersData,
    updateWorker,
    clearWorkers
  } = useWorkers();

  const sbs = useSbsStream({
    onWorkerUpdate: updateWorker,
    onLog: addLog
  });

  const handleDataLoaded = (data, name, meta) => {
    setWorkersData(data, name, meta);
    setCurrentStep(2); // Avanzar automáticamente al paso de visualización
  };

  const handleClearData = () => {
    clearWorkers();
    setCurrentStep(1);
  };

  const handleExport = (format) => {
    exportVisibleReport(format, filteredWorkers.length > 0 ? filteredWorkers : workers, visibleColumns);
    addLog({
      id: Date.now(),
      time: new Date().toLocaleTimeString('es-PE', { hour12: false }),
      message: `Reporte descargado con las columnas seleccionadas en formato ${format.toUpperCase()}.`,
      type: 'success'
    });
  };

  const handleExportAfiliacion = useCallback(() => {
    const sinAfiliados = workers.filter(w => w.semaforo === 'sin_afiliacion');
    if (sinAfiliados.length === 0) {
      alert('No hay registros sin afiliación previa en el padrón.');
      return;
    }
    exportAfiliacionReport(sinAfiliados);
    addLog({
      id: Date.now(),
      time: new Date().toLocaleTimeString('es-PE', { hour12: false }),
      message: `Reporte oficial de afiliación descargado para ${sinAfiliados.length} trabajadores sin afiliación previa.`,
      type: 'success'
    });
  }, [workers, addLog]);

  const handleRetryWorker = useCallback(async (worker) => {
    const nombre = worker.apellidos_nombres || worker.nombre_completo || worker.dni;
    addLog({
      id: Date.now(),
      time: new Date().toLocaleTimeString('es-PE', { hour12: false }),
      message: `Reintentando consulta SBS para: ${nombre} (${worker.dni})...`,
      type: 'info'
    });

    try {
      const sbsRes = await verifyWorkerSBS(worker);
      updateWorker(worker.dni, {
        sbs_resultado: sbsRes,
        sbs_consultado: true
      });
      const afpText = sbsRes?.afp || (sbsRes?.afiliado_spp ? 'ENCONTRADO' : 'NO REGISTRADO');
      addLog({
        id: Date.now(),
        time: new Date().toLocaleTimeString('es-PE', { hour12: false }),
        message: `[REINTENTO OK] DNI ${worker.dni} -> ${afpText}`,
        type: 'success'
      });
    } catch (err) {
      addLog({
        id: Date.now(),
        time: new Date().toLocaleTimeString('es-PE', { hour12: false }),
        message: `[REINTENTO ERROR] DNI ${worker.dni}: ${err.message}`,
        type: 'error'
      });
    }
  }, [addLog, updateWorker]);

  const handleRetryFailed = useCallback(async () => {
    const failedWorkers = workers.filter(w => w.semaforo === 'latencia');
    if (failedWorkers.length === 0) {
      alert('No hay registros con error para reintentar.');
      return;
    }
    await sbs.startScraping(failedWorkers);
  }, [workers, sbs]);

  return (
    <div className="mpfn-app">
      <Header />

      <main className="mpfn-container">
        {/* Stepper del MPFN Design System */}
        <WorkflowStepper
          currentStep={currentStep}
          onStepClick={setCurrentStep}
          hasData={workers.length > 0}
        />

        {/* PASO 1: CARGA DE ARCHIVO */}
        {currentStep === 1 && (
          <section className="step-view">
            <FileDropzone
              onDataLoaded={handleDataLoaded}
              onClear={handleClearData}
              fileName={fileName}
              fileMeta={fileMeta}
            />
            {workers.length > 0 && (
              <div className="step-nav-footer">
                <button
                  className="mpfn-btn-primary"
                  onClick={() => setCurrentStep(2)}
                  type="button"
                >
                  Continuar a Visualización <ArrowRight size={15} />
                </button>
              </div>
            )}
          </section>
        )}

        {/* PASO 2: VISUALIZACIÓN Y REVISIÓN DE DATOS DEL PADRÓN */}
        {currentStep === 2 && (
          <section className="step-view">
            <div className="step-action-bar">
              <span className="text-muted text-sm">
                Archivo activo: <strong>{fileName}</strong> ({workers.length} registros listos)
              </span>
              <button
                className="mpfn-btn-primary"
                onClick={() => setCurrentStep(3)}
                type="button"
              >
                Continuar a Verificación en Vivo <ArrowRight size={15} />
              </button>
            </div>

            <WorkersTable
              workers={workers}
              paginatedWorkers={paginatedWorkers}
              totalCount={workers.length}
              filteredCount={filteredWorkers.length}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              onSelectWorker={setSelectedWorker}
              onExport={handleExport}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              onRetryWorker={handleRetryWorker}
              onRetryFailed={handleRetryFailed}
              isRetryingFailed={sbs.status === 'running'}
              failedCount={metrics.errores}
            />
          </section>
        )}

        {/* PASO 3: VERIFICACIÓN EN VIVO CON EL BOT SBS */}
        {currentStep === 3 && (
          <section className="step-view">
            <SbsPanel
              status={sbs.status}
              progress={sbs.progress}
              elapsedTime={sbs.formattedTime}
              onStart={() => sbs.startScraping(workers)}
              onPause={sbs.pauseScraping}
              onResume={sbs.resumeScraping}
              onStop={sbs.stopScraping}
              onOpenConfig={() => setIsConfigOpen(true)}
              totalWorkers={workers.length}
              onGoToResults={() => setCurrentStep(4)}
            />

            <div className="step-action-bar">
              <span className="text-muted text-sm">
                Progreso de Verificación: <strong>{metrics.consultados}</strong> de <strong>{workers.length}</strong> consultados
              </span>
              <button
                className="mpfn-btn-primary"
                onClick={() => setCurrentStep(4)}
                type="button"
              >
                Continuar a Resultados y Reporte <ArrowRight size={15} />
              </button>
            </div>

            <WorkersTable
              workers={workers}
              paginatedWorkers={paginatedWorkers}
              totalCount={workers.length}
              filteredCount={filteredWorkers.length}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              onSelectWorker={setSelectedWorker}
              onExport={handleExport}
              onExportAfiliacion={handleExportAfiliacion}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              onRetryWorker={handleRetryWorker}
              onRetryFailed={handleRetryFailed}
              isRetryingFailed={sbs.status === 'running'}
              failedCount={metrics.errores}
            />
          </section>
        )}

        {/* PASO 4: RESULTADOS, SEMÁFOROS Y REPORTE FINAL */}
        {currentStep === 4 && (
          <section className="step-view">
            <ResultsStep
              workers={workers}
              filteredWorkers={filteredWorkers}
              paginatedWorkers={paginatedWorkers}
              metrics={metrics}
              fileName={fileName}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              onSelectWorker={setSelectedWorker}
              onExport={handleExport}
              onExportAfiliacion={handleExportAfiliacion}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              onBackToVerification={() => setCurrentStep(3)}
              onRetryWorker={handleRetryWorker}
              onRetryFailed={handleRetryFailed}
              isRetryingFailed={sbs.status === 'running'}
            />
          </section>
        )}
      </main>

      <LogConsole logs={logs} onClear={clearLogs} />

      <SbsConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onConfigSaved={sbs.reloadConfig}
      />

      <WorkerDetailModal
        worker={selectedWorker}
        onClose={() => setSelectedWorker(null)}
      />
    </div>
  );
}
export default App;
