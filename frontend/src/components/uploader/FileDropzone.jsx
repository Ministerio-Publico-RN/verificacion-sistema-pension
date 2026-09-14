import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, Trash2, Database, Loader2 } from 'lucide-react';
import { uploadSigaFile, fetchSampleData } from '../../api/sigaApi';

export function FileDropzone({ onDataLoaded, onClear, fileName, fileMeta }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const processFile = async (file) => {
    if (!file) return;
    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await uploadSigaFile(file);
      if (res.workers && res.workers.length > 0) {
        onDataLoaded(res.workers, file.name, `${res.workers.length} registros cargados`);
      } else {
        setErrorMsg('El archivo no contiene registros o no se pudieron leer las columnas.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error al procesar el archivo');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSample = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchSampleData();
      if (res.workers && res.workers.length > 0) {
        onDataLoaded(res.workers, res.filename || 'altas cas set 2026.DBF', `${res.workers.length} registros (Muestra)`);
      }
    } catch (err) {
      setErrorMsg('No se pudo cargar la muestra de prueba.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  if (fileName) {
    return (
      <div className="mpfn-loaded-bar">
        <div className="mpfn-loaded-info">
          <FileSpreadsheet className="mpfn-text-gold" size={22} />
          <div>
            <span className="mpfn-loaded-name">{fileName}</span>
            <span className="mpfn-loaded-meta"> · {fileMeta}</span>
          </div>
        </div>
        <button className="mpfn-btn-danger-outline" onClick={onClear} type="button">
          <Trash2 size={14} /> Cambiar Archivo
        </button>
      </div>
    );
  }

  return (
    <div className="mpfn-dropzone-wrap is-fullscreen-dropzone">
      <div
        className={`mpfn-dropzone mpfn-dropzone-hero ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".dbf,.csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
        />
        {isLoading ? (
          <div className="mpfn-dropzone-loading">
            <Loader2 className="mpfn-spin mpfn-text-gold" size={48} />
            <p className="mt-3 font-semibold">Procesando archivo...</p>
          </div>
        ) : (
          <>
            <div className="mpfn-dropzone-icon-circle">
              <UploadCloud className="mpfn-dropzone-icon" size={54} />
            </div>
            <h2 className="mpfn-dropzone-main-title">
              Arrastre aquí la lista de trabajadores (SIGA)
            </h2>
            <p className="mpfn-dropzone-help">
              Soporta archivos <strong>.DBF</strong> del SIGA, hojas <strong>Excel (.xlsx, .xls)</strong> y archivos <strong>.CSV</strong>
            </p>
            <div className="mpfn-dropzone-actions" onClick={(e) => e.stopPropagation()}>
              <button
                className="mpfn-btn-primary mpfn-btn-lg"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Examinar Archivo
              </button>
              <button
                className="mpfn-btn-secondary mpfn-btn-lg"
                onClick={handleSample}
                type="button"
              >
                <Database size={16} /> Cargar Muestra
              </button>
            </div>
          </>
        )}
      </div>
      {errorMsg && <div className="mpfn-alert-error">{errorMsg}</div>}
    </div>
  );
}
