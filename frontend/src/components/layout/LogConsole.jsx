import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

export function LogConsole({ logs, onClear }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    if (isExpanded) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isExpanded]);

  return (
    <div className={`mpfn-console-panel ${isExpanded ? 'is-expanded' : ''}`}>
      <div className="console-header" onClick={() => setIsExpanded(prev => !prev)}>
        <div className="console-title">
          <Terminal size={15} />
          <span>Consola de Operaciones en Tiempo Real</span>
          <span className="log-count">({logs.length})</span>
        </div>
        <div className="console-actions" onClick={(e) => e.stopPropagation()}>
          {logs.length > 0 && (
            <button className="console-btn-clear" onClick={onClear} title="Limpiar logs" type="button">
              <Trash2 size={13} />
            </button>
          )}
          <button className="console-btn-toggle" onClick={() => setIsExpanded(prev => !prev)} type="button">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="console-body">
          {logs.length === 0 ? (
            <div className="console-empty">No hay eventos registrados en esta sesión.</div>
          ) : (
            logs.map(log => (
              <div key={log.id} className={`log-entry log-${log.type}`}>
                <span className="log-time">[{log.time}]</span>
                <span className="log-msg">{log.message}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
