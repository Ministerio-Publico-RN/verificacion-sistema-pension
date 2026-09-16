import React, { useState, useEffect } from 'react';
import insigniaImg from '../../assets/mp-insignia-gold.png';
import { Moon, Sun, History, Home } from 'lucide-react';

export function Header({ onOpenHistory, onGoHome }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <header className="mpfn-header">
      <div className="mpfn-header-brand">
        <img src={insigniaImg} alt="Escudo MPFN" className="mpfn-insignia" />
        <div className="mpfn-title-group">
          <span className="mpfn-subtext">MINISTERIO PÚBLICO – FISCALÍA DE LA NACIÓN</span>
          <h1 className="mpfn-maintitle">Verificación del Sistema Previsional</h1>
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
          className="mpfn-theme-btn"
          onClick={toggleTheme}
          title={`Cambiar a tema ${theme === 'light' ? 'oscuro' : 'claro'}`}
          type="button"
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>
    </header>
  );
}
