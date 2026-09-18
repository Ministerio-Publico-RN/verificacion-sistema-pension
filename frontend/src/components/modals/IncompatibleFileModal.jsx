import React, { useState } from 'react';
import { X, AlertTriangle, FileSpreadsheet, CheckCircle2, Info, ArrowRight } from 'lucide-react';

export function IncompatibleFileModal({ isOpen, onClose, filename = '', errorDetails = '', initialTab = 'altas' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  if (!isOpen) return null;

  return (
    <div className="mpfn-modal-backdrop" onClick={onClose}>
      <div 
        className="mpfn-modal mpfn-modal-lg" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '820px' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid rgba(220, 53, 69, 0.3)' }}>
          <div className="modal-title-wrap">
            <AlertTriangle size={22} className="text-danger" style={{ color: '#dc3545' }} />
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Archivo No Compatible
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.825rem', color: 'rgba(255, 255, 255, 0.75)' }}>
                {filename ? `El archivo "${filename}" no pudo ser procesado.` : 'El archivo subido no coincide con la estructura requerida.'}
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '1.25rem 1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Mensaje de alerta */}
          <div style={{
            background: 'rgba(220, 53, 69, 0.12)',
            border: '1px solid rgba(220, 53, 69, 0.35)',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
            color: '#ffc9c9',
            fontSize: '0.875rem'
          }}>
            <strong>Motivo: </strong> 
            {errorDetails || 'No se encontraron registros con números de documento (DNI) válidos ni las columnas esperadas del SIGA.'}
          </div>

          <p style={{ fontSize: '0.9rem', color: '#e0e0e0', marginBottom: '1rem' }}>
            Para que el sistema pueda leer la información correctamente, asegúrese de que el archivo cumpla con los campos y requisitos según el modo de verificación:
          </p>

          {/* Selector de pestañas Altas / PEA */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setActiveTab('altas')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.875rem',
                background: activeTab === 'altas' ? '#c5a059' : 'rgba(255, 255, 255, 0.08)',
                color: activeTab === 'altas' ? '#121212' : '#ffffff',
                transition: 'all 0.15s ease'
              }}
            >
              📋 Requisitos para ALTAS (CAS / Nuevos Ingresos)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pea')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.875rem',
                background: activeTab === 'pea' ? '#c5a059' : 'rgba(255, 255, 255, 0.08)',
                color: activeTab === 'pea' ? '#121212' : '#ffffff',
                transition: 'all 0.15s ease'
              }}
            >
              👥 Requisitos para PEA (Planilla Activa)
            </button>
          </div>

          {/* Contenido Pestaña ALTAS */}
          {activeTab === 'altas' && (
            <div>
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#c5a059', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileSpreadsheet size={16} /> Columnas Obligatorias en ALTAS
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#dddddd', lineHeight: '1.6' }}>
                  <li><strong style={{ color: '#ffffff' }}>DNI</strong> (o <code>NUM_DOC</code>, <code>NRO_DOC</code>, <code>DOCUMENTO</code>): Número de documento de 8 dígitos.</li>
                  <li><strong style={{ color: '#ffffff' }}>APE_PAT</strong> (o <code>PATERNO</code>, <code>APELLIDO_PATERNO</code>): Apellido paterno del trabajador.</li>
                  <li><strong style={{ color: '#ffffff' }}>APE_MAT</strong> (o <code>MATERNO</code>, <code>APELLIDO_MATERNO</code>): Apellido materno del trabajador.</li>
                  <li><strong style={{ color: '#ffffff' }}>NOM_EMP</strong> (o <code>NOMBRE</code>, <code>NOMBRES</code>, <code>NOMBRE_COMPLETO</code>): Nombres del colaborador.</li>
                </ul>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#68b5fb', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Info size={16} /> Columnas Complementarias Recomendadas
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#cccccc', lineHeight: '1.6' }}>
                  <li><code>NACIM</code> (o <code>FECHA_NACIMIENTO</code>, <code>FEC_NAC</code>): Fecha de nacimiento (DD/MM/YYYY).</li>
                  <li><code>PREVISIONA</code> / <code>AFILIACION</code> / <code>CUSPP</code>: Datos previsionales declarados en SIGA.</li>
                  <li><code>DIRE_EMAI_</code> / <code>CELULAR</code>: Correo electrónico y celular de contacto.</li>
                  <li><code>DEPARTAMEN</code>, <code>PROVINCIA</code>, <code>DISTRITO</code>, <code>DIRECCION</code>: Necesarios para autocompletar el reporte de afiliación AFPnet.</li>
                </ul>
              </div>

              <div style={{ background: 'rgba(197, 160, 89, 0.08)', borderRadius: '8px', padding: '0.85rem 1rem', border: '1px solid rgba(197, 160, 89, 0.25)' }}>
                <h5 style={{ margin: '0 0 0.4rem 0', color: '#c5a059', fontSize: '0.875rem' }}>💡 Cambios requeridos si usa Excel (.xlsx / .xls) o CSV:</h5>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.825rem', color: '#cccccc', lineHeight: '1.5' }}>
                  <li>La <strong>Fila 1</strong> debe contener estrictamente los nombres de las cabeceras (no deje filas de títulos institucionales vacías arriba).</li>
                  <li>Asegúrese de no utilizar celdas combinadas en las cabeceras.</li>
                  <li>Verifique que los DNI no contengan guiones, letras ni espacios en blanco.</li>
                  <li>Si exporta desde el SIGA, utilice directamente el archivo <strong>.DBF</strong> sin abrirlo ni modificarlo.</li>
                </ol>
              </div>
            </div>
          )}

          {/* Contenido Pestaña PEA */}
          {activeTab === 'pea' && (
            <div>
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#c5a059', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileSpreadsheet size={16} /> Columnas Obligatorias en PEA (Planilla Activa)
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#dddddd', lineHeight: '1.6' }}>
                  <li><strong style={{ color: '#ffffff' }}>DNI</strong> (o <code>COD_EMP</code>, <code>NUM_DOC</code>): Número de documento de 8 dígitos.</li>
                  <li>
                    <strong style={{ color: '#ffffff' }}>REGI_PENS_</strong>: Código del régimen de pensiones:
                    <div style={{ fontSize: '0.8rem', color: '#a0a0a0', marginTop: '2px' }}>
                      Valores válidos: <code>19990</code>, <code>20530</code>, <code>25897</code>, <code>05188</code>, <code>E-19990</code>, <code>E-AFP</code>, <code>EXONERA</code>.
                    </div>
                  </li>
                  <li>
                    <strong style={{ color: '#ffffff' }}>CODI_AFPS_</strong>: Código numérico oficial de la AFP:
                    <div style={{ fontSize: '0.8rem', color: '#a0a0a0', marginTop: '2px' }}>
                      Valores válidos: <code>02</code> (Profuturo), <code>03</code> (Integra), <code>05</code> (Prima), <code>06</code> (Habitat) o en blanco para SNP/ONP.
                    </div>
                  </li>
                  <li><strong style={{ color: '#ffffff' }}>NOM_EMP</strong>, <code>APE_PAT</code>, <code>APE_MAT</code> (o <code>TRABAJADOR</code> / <code>NOMB_CORT_</code>): Identificación del trabajador.</li>
                </ul>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#68b5fb', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Info size={16} /> Columnas Complementarias de Planilla
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#cccccc', lineHeight: '1.6' }}>
                  <li><code>CODI_CUSP_</code>: Código CUSPP asignado.</li>
                  <li><code>FECH_INGR_</code>: Fecha de ingreso o inicio laboral.</li>
                  <li><code>FECH_NACI_</code>: Fecha de nacimiento.</li>
                </ul>
              </div>

              <div style={{ background: 'rgba(197, 160, 89, 0.08)', borderRadius: '8px', padding: '0.85rem 1rem', border: '1px solid rgba(197, 160, 89, 0.25)' }}>
                <h5 style={{ margin: '0 0 0.4rem 0', color: '#c5a059', fontSize: '0.875rem' }}>💡 Cambios requeridos para archivos de la PEA:</h5>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.825rem', color: '#cccccc', lineHeight: '1.5' }}>
                  <li>Asegúrese de cargar el reporte correspondiente a cada categoría: <strong>Pensionistas</strong>, <strong>Nombrados (276)</strong>, <strong>CAS (1057)</strong> o <strong>Contratados (728)</strong>.</li>
                  <li>El archivo debe incluir indispensablemente las columnas <code>REGI_PENS_</code> y <code>CODI_AFPS_</code> tal como las exporta el módulo de planillas del SIGA.</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button className="mpfn-btn-primary" onClick={onClose} type="button">
            Entendido, cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
