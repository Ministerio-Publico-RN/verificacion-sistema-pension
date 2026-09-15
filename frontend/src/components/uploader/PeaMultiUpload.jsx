import React, { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, Loader2, ArrowRight, RotateCw } from 'lucide-react';
import { uploadSigaFile } from '../../api/sigaApi';

const CATEGORIES = [
  { code: 'PENSIONISTAS', label: 'Pensionistas' },
  { code: 'NOMBRADOS', label: 'Nombrados (276)' },
  { code: 'CAS', label: 'CAS (1057)' },
  { code: 'CONTRATADOS', label: 'Contratados (728)' }
];

function CategoryCard({ code, label, state, onFile }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const status = state?.status || 'idle';

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
  };

  return (
    <div
      className={`mpfn-pea-card is-${status} ${isDragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => status !== 'loading' && inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".dbf,.csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <div className="mpfn-pea-card-icon">
        {status === 'loading' && <Loader2 size={26} className="mpfn-spin" />}
        {status === 'loaded' && <CheckCircle2 size={26} />}
        {(status === 'idle' || status === 'error') && <UploadCloud size={26} />}
      </div>
      <h4>{label}</h4>
      {status === 'loaded' && (
        <p className="mpfn-pea-card-meta">
          {state.fileName} · {state.total} registros
        </p>
      )}
      {status === 'loading' && <p className="mpfn-pea-card-meta">Procesando...</p>}
      {status === 'error' && <p className="mpfn-pea-card-error">{state.error}</p>}
      {status === 'idle' && <p className="mpfn-pea-card-meta">Arrastre el archivo o haga clic para examinar</p>}
      {status === 'loaded' && (
        <span className="mpfn-pea-card-retry">
          <RotateCw size={12} /> Cambiar archivo
        </span>
      )}
    </div>
  );
}

export function PeaMultiUpload({ onContinue }) {
  const [files, setFiles] = useState({});

  const handleFile = async (code, file) => {
    setFiles(prev => ({ ...prev, [code]: { status: 'loading' } }));
    try {
      const res = await uploadSigaFile(file, code);
      if (res.workers && res.workers.length > 0) {
        setFiles(prev => ({
          ...prev,
          [code]: { status: 'loaded', fileName: file.name, total: res.workers.length, workers: res.workers }
        }));
      } else {
        setFiles(prev => ({ ...prev, [code]: { status: 'error', error: 'El archivo no contiene registros válidos.' } }));
      }
    } catch (err) {
      setFiles(prev => ({ ...prev, [code]: { status: 'error', error: err.message || 'Error al procesar el archivo.' } }));
    }
  };

  const loadedCategories = CATEGORIES.filter(c => files[c.code]?.status === 'loaded');
  const missingCategories = CATEGORIES.filter(c => files[c.code]?.status !== 'loaded');
  const canContinue = loadedCategories.length > 0;

  const handleContinue = () => {
    const combined = loadedCategories.flatMap(c => files[c.code].workers);
    const archivos = loadedCategories.map(c => ({
      origen: c.code,
      filename: files[c.code].fileName,
      total: files[c.code].total
    }));
    onContinue(combined, archivos);
  };

  return (
    <div className="mpfn-pea-upload-wrap">
      <h3 className="mpfn-pea-upload-title">Cargue los reportes de la Planilla PEA</h3>
      <p className="text-muted text-sm">Puede continuar con las categorías que ya tenga listas; las demás se pueden agregar más adelante.</p>

      <div className="mpfn-pea-upload-grid">
        {CATEGORIES.map(cat => (
          <CategoryCard
            key={cat.code}
            code={cat.code}
            label={cat.label}
            state={files[cat.code]}
            onFile={(file) => handleFile(cat.code, file)}
          />
        ))}
      </div>

      <div className="mpfn-pea-upload-footer">
        {missingCategories.length > 0 && (
          <span className="text-muted text-sm">
            Falta cargar: {missingCategories.map(c => c.label).join(', ')}
          </span>
        )}
        <button
          className="mpfn-btn-primary mpfn-btn-lg"
          disabled={!canContinue}
          onClick={handleContinue}
          type="button"
        >
          Continuar ({loadedCategories.reduce((sum, c) => sum + files[c.code].total, 0)} registros) <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
