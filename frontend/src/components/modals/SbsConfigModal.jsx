import React, { useState, useEffect } from 'react';
import { X, Sliders, Save, Check, Eye, EyeOff } from 'lucide-react';
import { getSbsConfig, saveSbsConfig } from '../../api/sbsApi';

export function SbsConfigModal({ isOpen, onClose, onConfigSaved }) {
  const [concurrency, setConcurrency] = useState(3);
  const [headless, setHeadless] = useState(false);
  const [delaySec, setDelaySec] = useState('2.0');
  const [maxRetries, setMaxRetries] = useState(25);
  const [blockCooldownSec, setBlockCooldownSec] = useState('3-7');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getSbsConfig().then(cfg => {
        if (cfg) {
          setConcurrency(cfg.concurrency || 3);
          setHeadless(Boolean(cfg.headless));
          setDelaySec(cfg.delay_between !== undefined ? String(cfg.delay_between) : '2.0');
          setMaxRetries(cfg.max_retries || 25);
          setBlockCooldownSec(cfg.block_cooldown !== undefined ? String(cfg.block_cooldown) : '3-7');
        }
      }).catch(console.warn);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await saveSbsConfig({
        concurrency: Number(concurrency),
        headless: Boolean(headless),
        delay_between: String(delaySec).trim(),
        max_retries: Number(maxRetries),
        block_cooldown: String(blockCooldownSec).trim()
      });
      setSavedSuccess(true);
      onConfigSaved?.();
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1000);
    } catch (err) {
      alert(`Error al guardar configuración: ${err.message}`);
    }
  };

  return (
    <div className="mpfn-modal-backdrop" onClick={onClose}>
      <div className="mpfn-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <Sliders size={18} className="mpfn-text-gold" />
            <h3>Configuración del Motor SBS</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          <div className="form-group">
            <label>Modo de Ejecución del Navegador:</label>
            <div className="mpfn-toggle-group">
              <button
                type="button"
                className={`mpfn-toggle-btn ${!headless ? 'is-active' : ''}`}
                onClick={() => setHeadless(false)}
              >
                <Eye size={15} /> Ventana Visible en Pantalla
              </button>
              <button
                type="button"
                className={`mpfn-toggle-btn ${headless ? 'is-active' : ''}`}
                onClick={() => setHeadless(true)}
              >
                <EyeOff size={15} /> Segundo Plano (Headless)
              </button>
            </div>
            <small className="form-hint">
              {!headless
                ? 'El navegador se abrirá en tu pantalla para monitorear el avance y resolver retos si aparecen.'
                : 'El navegador operará de forma silenciosa e invisible en segundo plano.'}
            </small>
          </div>

          <div className="form-group">
            <label>Ventanas Concurrentes (1 a 10):</label>
            <input
              type="number"
              min={1}
              max={10}
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
              className="mpfn-input"
            />
            <small className="form-hint">Cada ventana corre en una instancia independiente de navegador.</small>
          </div>

          <div className="form-group">
            <label>Tiempo de espera entre consultas (segundos):</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ej: 2  ó  10-20"
              value={delaySec}
              onChange={(e) => setDelaySec(e.target.value)}
              className="mpfn-input"
            />
            <small className="form-hint">
              Un número fijo ("2") o un rango ("10-20") para esperar un tiempo aleatorio entre ambos valores en cada consulta. Sin límite máximo.
            </small>
          </div>

          <div className="form-group">
            <label>Máximo de reintentos por trabajador fallido:</label>
            <input
              type="number"
              min={1}
              max={50}
              value={maxRetries}
              onChange={(e) => setMaxRetries(e.target.value)}
              className="mpfn-input"
            />
          </div>

          <div className="form-group">
            <label>Tiempo de enfriamiento ante bloqueos (segundos):</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ej: 5  ó  3-7"
              value={blockCooldownSec}
              onChange={(e) => setBlockCooldownSec(e.target.value)}
              className="mpfn-input"
            />
            <small className="form-hint">
              Un número fijo ("5") o un rango ("3-7") para esperar un tiempo aleatorio entre ambos valores tras cada bloqueo. Por defecto: 3-7.
            </small>
          </div>

          <div className="modal-footer">
            <button type="button" className="mpfn-btn-outline" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="mpfn-btn-primary">
              {savedSuccess ? <><Check size={15} /> Guardado</> : <><Save size={15} /> Guardar Configuración</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
