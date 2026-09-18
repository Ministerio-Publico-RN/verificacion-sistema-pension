import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, Trash2, Loader2, AlertTriangle, HelpCircle } from 'lucide-react';
import { uploadSigaFile } from '../../api/sigaApi';
import { IncompatibleFileModal } from '../modals/IncompatibleFileModal';

export function FileDropzone({ onDataLoaded, onClear, fileName, fileMeta }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [modalState, setModalState] = useState({ open: false, filename: '', error: '' });
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
        const msg = 'El archivo subido no contiene registros válidos o las columnas requeridas.';
        setErrorMsg(msg);
        setModalState({ open: true, filename: file.name, error: msg });
      }
    } catch (err) {
      const msg = err.message || 'El archivo subido no es compatible con la estructura requerida.';
      setErrorMsg(msg);
      setModalState({ open: true, filename: file.name, error: msg });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
            </div>
          </>
        )}
      </div>

      {errorMsg && (
        <div className="mpfn-alert-error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, color: '#dc3545' }} />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            className="mpfn-btn-outline"
            onClick={() => setModalState(prev => ({ ...prev, open: true }))}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem', borderColor: 'rgba(220,53,69,0.5)', color: '#ffb3b8' }}
          >
            <HelpCircle size={14} /> Ver formato y cambios requeridos
          </button>
        </div>
      )}

      <IncompatibleFileModal
        isOpen={modalState.open}
        onClose={() => setModalState(prev => ({ ...prev, open: false }))}
        filename={modalState.filename}
        errorDetails={modalState.error}
        initialTab="altas"
      />
    </div>
  );
}
