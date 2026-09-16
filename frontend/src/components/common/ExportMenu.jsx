import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, FileType, ChevronDown } from 'lucide-react';

const EXPORT_FORMATS = [
  { key: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
  { key: 'csv', label: 'CSV', icon: FileText },
  { key: 'pdf', label: 'PDF', icon: FileType }
];

export function ExportMenu({ onExport, label = 'Exportar', className = 'mpfn-btn-outline' }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (format) => {
    setIsOpen(false);
    onExport(format);
  };

  return (
    <div className="mpfn-col-picker-wrap" ref={ref}>
      <button
        type="button"
        className={`${className} ${isOpen ? 'is-active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Exportar resultados"
      >
        <Download size={14} /> <span>{label}</span> <ChevronDown size={13} />
      </button>

      {isOpen && (
        <div className="mpfn-col-dropdown">
          <div className="dropdown-title">Formato de Exportación</div>
          {EXPORT_FORMATS.map(({ key, label: fmtLabel, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className="mpfn-export-option"
              onClick={() => handleSelect(key)}
            >
              <Icon size={14} /> <span>{fmtLabel}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
