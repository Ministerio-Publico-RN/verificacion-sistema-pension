import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from './components/layout/Header';
import { WorkflowStepper } from './components/layout/WorkflowStepper';
import { FileDropzone } from './components/uploader/FileDropzone';
import { PeaMultiUpload } from './components/uploader/PeaMultiUpload';
import { ModeSelectScreen } from './components/selection/ModeSelectScreen';
import { HistoryPanel } from './components/history/HistoryPanel';
import { SbsPanel } from './components/scrapers/SbsPanel';
import { ResultsStep } from './components/results/ResultsStep';
import { WorkersTable } from './components/table/WorkersTable';
import { SbsConfigModal } from './components/modals/SbsConfigModal';
import { WorkerDetailModal } from './components/modals/WorkerDetailModal';
import { LogConsole } from './components/layout/LogConsole';
import { useWorkers, evaluateWorkerSemaforo } from './hooks/useWorkers';
import { useSbsStream } from './hooks/useSbsStream';
import { exportVisibleReport, exportAfiliacionReport } from './api/exportApi';
import { verifyWorkerSBS } from './api/sbsApi';
import { createExecution, getExecution, updateExecutionStatus } from './api/sigaApi';
import { ArrowRight } from 'lucide-react';

export function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [logs, setLogs] = useState([]);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);

  // Modo de verificación elegido en la pantalla inicial: null | 'altas' | 'pea'
  const [mode, setMode] = useState(null);
  const [executionId, setExecutionId] = useState(null);

  // Columnas visibles (Consulta AFPNet oculta por defecto, Fecha de Afiliación visible)
  const [visibleColumns, setVisibleColumns] = useState({
    num: true,
    worker: true,
    regimen: true,
    previsional: true,
    afiliacion: true,
    cuspp: true,
    sbs: true,
    semaforo: true,
    afpnet: false,
    nacim: false,
    cargo: false,
    origen: false
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

  const startExecution = useCallback(async (tipo, archivos, workersData, name, meta) => {
    setWorkersData(workersData, name, meta);
    setMode(tipo);
    setCurrentStep(2);
    try {
      const res = await createExecution(tipo, archivos, workersData);
      setExecutionId(res.execution_id);
    } catch (err) {
      addLog({
        id: Date.now(),
        time: new Date().toLocaleTimeString('es-PE', { hour12: false }),
        message: `No se pudo registrar la ejecución en el historial: ${err.message}. La verificación continuará sin poder reanudarse si se recarga la página.`,
        type: 'warning'
      });
    }
  }, [setWorkersData, addLog]);

  const handleDataLoaded = (data, name, meta) => {
    startExecution('altas', [{ origen: null, filename: name, total: data.length }], data, name, meta);
  };

  const handlePeaContinue = (combinedWorkers, archivosMeta) => {
    const name = archivosMeta.map(a => a.origen).join(' + ');
    const meta = `${combinedWorkers.length} registros (${archivosMeta.length} de 4 planillas)`;
    startExecution('pea', archivosMeta, combinedWorkers, name, meta);
  };

  const handleClearData = () => {
    if (executionId) {
      updateExecutionStatus(executionId, 'completado').catch(() => {});
    }
    clearWorkers();
    setExecutionId(null);
    setCurrentStep(1);
  };

  const handleGoHome = useCallback(() => {
    if (workers.length > 0) {
      const confirmed = window.confirm(
        '¿Seguro que desea volver al inicio? Se saldrá de esta ejecución (su avance queda guardado en el Historial de Ejecuciones).'
      );
      if (!confirmed) return;
    }
    if (sbs.status === 'running' || sbs.status === 'paused') {
      sbs.stopScraping();
    }
    clearWorkers();
    setExecutionId(null);
    setMode(null);
    setCurrentStep(1);
  }, [workers.length, sbs, clearWorkers]);

  const hydrateExecution = useCallback(async (execution) => {
    const full = await getExecution(execution.id);
    const name = (full.archivos || []).map(a => a.filename).filter(Boolean).join(' + ') || `Ejecución #${full.id}`;
    const loadedWorkers = full.workers || [];
    setWorkersData(loadedWorkers, name, `${loadedWorkers.length} registros`);
    setMode(full.tipo);
    setExecutionId(full.id);
    setIsHistoryOpen(false);
    const pendientes = loadedWorkers.filter(w => evaluateWorkerSemaforo(w).tone === 'sin_verificar').length;
    const isCompleted = full.estado === 'completado' && pendientes === 0;
    const elapsedSeconds = (full.fecha_inicio && full.fecha_actualizacion)
      ? Math.max(0, Math.round((new Date(full.fecha_actualizacion) - new Date(full.fecha_inicio)) / 1000))
      : 0;
    sbs.hydrateProgress({
      current: loadedWorkers.length - pendientes,
      total: loadedWorkers.length,
      completed: isCompleted,
      elapsedSeconds
    });
    setCurrentStep(isCompleted ? 3 : 2);
  }, [setWorkersData, sbs]);

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
      const sbsRes = await verifyWorkerSBS(worker, executionId);
      updateWorker(worker.dni, {
        sbs_resultado: sbsRes,
        sbs_consultado: sbsRes?.estado_sbs !== 'CANCELADO'
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
  }, [addLog, updateWorker, executionId]);

  const handleRetryFailed = useCallback(async () => {
    const failedWorkers = workers.filter(w => w.semaforo === 'latencia');
    if (failedWorkers.length === 0) {
      alert('No hay registros con error para reintentar.');
      return;
    }
    await sbs.startScraping(failedWorkers, executionId);
  }, [workers, sbs, executionId]);

  const handleContinueExecution = useCallback(async () => {
    const pendingWorkers = workers.filter(w => !w.semaforo || w.semaforo === 'sin_verificar');
    if (pendingWorkers.length === 0) {
      alert('No quedan trabajadores pendientes por consultar.');
      return;
    }
    await sbs.startScraping(pendingWorkers, executionId, {
      resetTimer: false,
      baseProgress: { current: workers.length - pendingWorkers.length, total: workers.length }
    });
  }, [workers, sbs, executionId]);

  const handleBackToVerification = useCallback(() => {
    setStatusFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
    setCurrentStep(2);
  }, [setStatusFilter, setSearchQuery, setCurrentPage, setCurrentStep]);

  // Al finalizar la verificación SBS, avanzar automáticamente a Resultados y Reporte, pero
  // solo una vez por cada finalización y si ya no quedan trabajadores pendientes por consultar.
  const autoAdvancedRef = useRef(false);
  useEffect(() => {
    if (sbs.status === 'completed') {
      const hasPending = workers.some(w => !w.semaforo || w.semaforo === 'sin_verificar');
      if (!autoAdvancedRef.current && !hasPending) {
        autoAdvancedRef.current = true;
        setCurrentStep(3);
      }
    } else {
      autoAdvancedRef.current = false;
    }
  }, [sbs.status, workers]);

  // Mientras haya una ejecución activa (modo elegido), recargar o cerrar la pestaña pide
  // confirmación para no perder el avance por accidente. Si además hay una verificación SBS
  // en curso, se cierran también las ventanas del navegador que hubiera abiertas.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (sbs.status === 'running' || sbs.status === 'paused') {
        try {
          navigator.sendBeacon('/api/sbs/stop', new Blob());
        } catch (_) {}
      }
      if (mode) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sbs.status, mode]);

  const historyPanel = (
    <HistoryPanel
      isOpen={isHistoryOpen}
      onClose={() => setIsHistoryOpen(false)}
      onOpenExecution={hydrateExecution}
    />
  );

  // Pantalla de selección de modo (Altas vs PEA) antes de iniciar el flujo de pasos
  if (!mode) {
    return (
      <div className="mpfn-app">
        <Header onOpenHistory={() => setIsHistoryOpen(true)} />
        <main className="mpfn-container">
          <ModeSelectScreen onSelectMode={setMode} />
        </main>
        {historyPanel}
      </div>
    );
  }

  return (
    <div className="mpfn-app">
      <Header onOpenHistory={() => setIsHistoryOpen(true)} onGoHome={handleGoHome} />

      <main className="mpfn-container">
        {/* Stepper del MPFN Design System */}
        <WorkflowStepper
          currentStep={currentStep}
          onStepClick={setCurrentStep}
          hasData={workers.length > 0}
        />

        {/* PASO 1: CARGA DE ARCHIVO(S) */}
        {currentStep === 1 && (
          <section className="step-view">
            {mode === 'pea' ? (
              <PeaMultiUpload onContinue={handlePeaContinue} />
            ) : (
              <>
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
              </>
            )}
          </section>
        )}

        {/* PASO 2: PADRÓN Y VERIFICACIÓN EN VIVO CON EL BOT SBS */}
        {currentStep === 2 && (
          <section className="step-view">
            <div className="step-action-bar">
              <span className="text-muted text-sm">
                Archivo activo: <strong>{fileName}</strong> ({workers.length} registros listos)
              </span>
            </div>

            <SbsPanel
              status={sbs.status}
              progress={sbs.progress}
              elapsedTime={sbs.formattedTime}
              onStart={() => sbs.startScraping(workers, executionId)}
              onPause={sbs.pauseScraping}
              onResume={sbs.resumeScraping}
              onStop={sbs.stopScraping}
              onContinue={handleContinueExecution}
              onOpenConfig={() => setIsConfigOpen(true)}
              totalWorkers={workers.length}
              onGoToResults={() => setCurrentStep(3)}
              onRetryFailed={handleRetryFailed}
              failedCount={metrics.errores}
              pendingCount={metrics.pendientes}
            />

            <div className="step-action-bar">
              <span className="text-muted text-sm">
                Progreso de Verificación: <strong>{metrics.consultados}</strong> de <strong>{workers.length}</strong> consultados
              </span>
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
              inProgressDnis={sbs.inProgressDnis}
              attemptCounts={sbs.attemptCounts}
            />
          </section>
        )}

        {/* PASO 3: RESULTADOS, SEMÁFOROS Y REPORTE FINAL */}
        {currentStep === 3 && (
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
              onBackToVerification={handleBackToVerification}
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

      {historyPanel}
    </div>
  );
}
export default App;
