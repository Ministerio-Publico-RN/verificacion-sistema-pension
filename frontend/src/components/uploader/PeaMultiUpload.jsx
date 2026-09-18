import React, { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, Loader2, ArrowRight, RotateCw, HelpCircle } from 'lucide-react';
import { uploadSigaFile } from '../../api/sigaApi';
import { IncompatibleFileModal } from '../modals/IncompatibleFileModal';

const CATEGORIES = [
  { code: 'PENSIONISTAS', label: 'Pensionistas' },
  { code: 'NOMBRADOS', label: 'Nombrados (276)' },
  { code: 'CAS', label: 'CAS (1057)' },
  { code: 'CONTRATADOS', label: 'Contratados (728)' }
];

const BLANK_KEY = '__blank__';

const REGIME_OPTIONS = [
  { code: '19990', label: '19990' },
  { code: '20530', label: '20530' },
  { code: '25897', label: '25897' },
  { code: 'E-19990', label: 'E-19990' },
  { code: 'E-AFP', label: 'E-AFP' },
  { code: 'E-CM', label: 'E-CM' },
  { code: 'EXONERA', label: 'EXONERA' },
  { code: '05188', label: '05188' },
  { code: BLANK_KEY, label: 'En blanco / Otro código' }
];

const ALL_REGIME_KEYS = REGIME_OPTIONS.map(r => r.code);

function CategoryCard({ code, label, state, onFile, onOpenIncompatible }) {
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
      {status === 'error' && (
        <div>
          <p className="mpfn-pea-card-error">{state.error}</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenIncompatible?.(state.fileName, state.error);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#c5a059',
              fontSize: '0.75rem',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: '0.2rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              margin: '0.35rem auto 0 auto'
            }}
          >
            <HelpCircle size={12} /> Ver formato requerido
          </button>
        </div>
      )}
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
  const [selectedRegimes, setSelectedRegimes] = useState(() => new Set(ALL_REGIME_KEYS));
  const [incompatibleModal, setIncompatibleModal] = useState({ open: false, filename: '', error: '' });

  const toggleRegime = (code) => {
    setSelectedRegimes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectAllRegimes = () => setSelectedRegimes(new Set(ALL_REGIME_KEYS));
  const selectNoneRegimes = () => setSelectedRegimes(new Set());

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
        const msg = 'El archivo no contiene registros compatibles con las columnas de PEA (DNI, REGI_PENS_, CODI_AFPS_).';
        setFiles(prev => ({ ...prev, [code]: { status: 'error', error: msg, fileName: file.name } }));
        setIncompatibleModal({ open: true, filename: file.name, error: msg });
      }
    } catch (err) {
      const msg = err.message || 'Error al procesar el archivo. No coincide con la estructura requerida.';
      setFiles(prev => ({ ...prev, [code]: { status: 'error', error: msg, fileName: file.name } }));
      setIncompatibleModal({ open: true, filename: file.name, error: msg });
    }
  };

  const loadedCategories = CATEGORIES.filter(c => files[c.code]?.status === 'loaded');
  const missingCategories = CATEGORIES.filter(c => files[c.code]?.status !== 'loaded');
  const canContinue = loadedCategories.length > 0 && selectedRegimes.size > 0;

  const filterByRegime = (workers) => workers.filter(w => {
    const code = (w.regi_pens_codigo || '').trim().toUpperCase();
    return code ? selectedRegimes.has(code) : selectedRegimes.has(BLANK_KEY);
  });

  const filteredTotal = loadedCategories.reduce(
    (sum, c) => sum + filterByRegime(files[c.code].workers).length,
    0
  );

  const handleContinue = () => {
    const combined = filterByRegime(loadedCategories.flatMap(c => files[c.code].workers));
    const archivos = loadedCategories.map(c => ({
      origen: c.code,
      filename: files[c.code].fileName,
      total: filterByRegime(files[c.code].workers).length
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
            onOpenIncompatible={(fn, err) => setIncompatibleModal({ open: true, filename: fn || '', error: err || '' })}
          />
        ))}
      </div>

      <div className="mpfn-pea-regime-filter">
        <div className="mpfn-pea-regime-filter-header">
          <h4>Regímenes previsionales a considerar (REGI_PENS_)</h4>
          <div className="mpfn-pea-regime-filter-actions">
            <button type="button" className="mpfn-link-btn" onClick={selectAllRegimes}>Todos</button>
            <button type="button" className="mpfn-link-btn" onClick={selectNoneRegimes}>Ninguno</button>
          </div>
        </div>
        <p className="text-muted text-sm">
          Marque los regímenes previsionales que desea verificar. Los no seleccionados serán omitidos.
        </p>
        <div className="mpfn-pea-regime-grid">
          {REGIME_OPTIONS.map(({ code, label }) => (
            <label key={code} className="col-checkbox-label">
              <input
                type="checkbox"
                checked={selectedRegimes.has(code)}
                onChange={() => toggleRegime(code)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {selectedRegimes.size === 0 && (
          <p className="mpfn-alert-error">Seleccione al menos un régimen para poder continuar.</p>
        )}
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
          Continuar ({filteredTotal} registros) <ArrowRight size={15} />
        </button>
      </div>

      <IncompatibleFileModal
        isOpen={incompatibleModal.open}
        onClose={() => setIncompatibleModal(prev => ({ ...prev, open: false }))}
        filename={incompatibleModal.filename}
        errorDetails={incompatibleModal.error}
        initialTab="pea"
      />
    </div>
  );
}
