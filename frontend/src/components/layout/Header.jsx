import React, { useState, useEffect } from 'react';
import insigniaImg from '../../assets/mp-insignia-gold.png';
import { Moon, Sun, History, Home, ArrowUpCircle } from 'lucide-react';
import { UpdateModal } from '../modals/UpdateModal';
import { checkAppUpdate } from '../../api/updateApi';

export function Header({ onOpenHistory, onGoHome }) {
  const [theme, setTheme] = useState('light');
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [hasUpdateBadge, setHasUpdateBadge] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    checkAppUpdate().then(res => {
      if (res?.has_update) {
        setHasUpdateBadge(true);
      }
    }).catch(() => {});
  }, []);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <header className="mpfn-header">
      <div className="mpfn-header-brand">
        <img src={insigniaImg} alt="Escudo MPFN" className="mpfn-insignia" />
        <div className="mpfn-title-group">
          <span className="mpfn-subtext">MINISTERIO PÚBLICO – FISCALÍA DE LA NACIÓN</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 className="mpfn-maintitle" style={{ margin: 0 }}>Verificación del Sistema Previsional</h1>
            <span className="mpfn-hco-tag">SISTEMAS HCO • v1.0.11</span>
          </div>
        </div>
      </div>

      <div className="mpfn-header-actions">
        {onGoHome && (
          <button
            className="mpfn-theme-btn mpfn-history-btn"
            onClick={onGoHome}
            title="Volver al inicio"
            type="button"
          >
            <Home size={16} />
            <span>Volver al inicio</span>
          </button>
        )}
        {onOpenHistory && (
          <button
            className="mpfn-theme-btn mpfn-history-btn"
            onClick={onOpenHistory}
            title="Historial de ejecuciones"
            type="button"
          >
            <History size={16} />
            <span>Historial de ejecuciones</span>
          </button>
        )}
        <button
          className="mpfn-theme-btn mpfn-history-btn"
          onClick={() => {
            setIsUpdateModalOpen(true);
            setHasUpdateBadge(false);
          }}
          title="Buscar actualizaciones del sistema"
          type="button"
          style={{ position: 'relative' }}
        >
          <ArrowUpCircle size={16} />
          <span>Actualizaciones</span>
          {hasUpdateBadge && (
            <span
              style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 0 2px var(--bg-primary)'
              }}
            />
          )}
        </button>
        <button
          className="mpfn-theme-btn"
          onClick={toggleTheme}
          title={`Cambiar a tema ${theme === 'light' ? 'oscuro' : 'claro'}`}
          type="button"
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>

      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
      />
    </header>
  );
}
