import React, { useState, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { WorkflowStepper } from './components/layout/WorkflowStepper';
import { FileDropzone } from './components/uploader/FileDropzone';
import { PadronMetricsCards } from './components/metrics/PadronMetricsCards';
import { SbsPanel } from './components/scrapers/SbsPanel';
import { ResultsStep } from './components/results/ResultsStep';
import { WorkersTable } from './components/table/WorkersTable';
import { SbsConfigModal } from './components/modals/SbsConfigModal';
import { WorkerDetailModal } from './components/modals/WorkerDetailModal';
import { LogConsole } from './components/layout/LogConsole';
import { useWorkers } from './hooks/useWorkers';
import { useSbsStream } from './hooks/useSbsStream';
import { exportVisibleReport } from './api/exportApi';
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
            {/* Desglose del Padrón: Total, SNP, Integra, Prima, Profuturo, Habitat, En blanco */}
            <PadronMetricsCards
              workers={workers}
              activeFilter={statusFilter}
              onFilterChange={setStatusFilter}
            />

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
            />
          </section>
        )}

        {/* PASO 3: VERIFICACIÓN EN VIVO CON EL BOT SBS */}
        {currentStep === 3 && (
          <section className="step-view">
            <SbsPanel
              status={sbs.status}
              progress={sbs.progress}
              activeWindows={sbs.activeWindows}
              headless={sbs.headless}
              onToggleHeadless={sbs.toggleHeadless}
              onStart={() => sbs.startScraping(workers)}
              onPause={sbs.pauseScraping}
              onResume={sbs.resumeScraping}
              onStop={sbs.stopScraping}
              onOpenConfig={() => setIsConfigOpen(true)}
              totalWorkers={workers.length}
              captchaAlert={sbs.captchaAlert}
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
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
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
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              onBackToVerification={() => setCurrentStep(3)}
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
