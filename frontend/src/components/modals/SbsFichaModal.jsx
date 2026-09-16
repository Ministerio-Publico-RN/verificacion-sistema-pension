import React from 'react';
import { X, Printer } from 'lucide-react';

export function SbsFichaModal({ worker, onClose }) {
  if (!worker) return null;

  const sbs = worker.sbs_resultado || {};
  const isAfiliado = sbs.afiliado_spp === true || sbs.estado_sbs === 'ENCONTRADO' || ['PROFUTURO', 'INTEGRA', 'PRIMA', 'HABITAT'].includes((sbs.afp || '').toUpperCase());

  // Formatear nombres y apellidos para la presentación
  const apePat = worker.ape_paterno || worker.paterno || '';
  const apeMat = worker.ape_materno || worker.materno || '';
  const nombres = worker.nombres || worker.primer_nombre ? `${worker.primer_nombre || ''} ${worker.segundo_nombre || ''}`.trim() : (worker.apellidos_nombres || '');

  // Formatear nombre de AFP en minúsculas con inicial mayúscula si corresponde
  const rawAfp = sbs.afp || '';
  const afpFormatted = rawAfp ? rawAfp.charAt(0).toUpperCase() + rawAfp.slice(1).toLowerCase() : 'No registrado';

  const fechaConsulta = sbs.fecha_consulta || new Date().toLocaleString('es-PE', { hour12: false });
  const fechaAfiliacion = sbs.fecha_afiliacion && sbs.fecha_afiliacion !== '-' ? sbs.fecha_afiliacion : (worker.afiliacion_siga || '-');
  const cuspp = sbs.cuspp && sbs.cuspp !== '-' ? sbs.cuspp : (worker.cuspp || '-');
  const situacion = sbs.situacion && sbs.situacion !== '-' ? sbs.situacion : 'Afiliado';
  const fechaDevengue = sbs.fecha_devengue || 'No hay datos';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="mpfn-modal-backdrop sbs-ficha-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="sbs-ficha-window" 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          color: '#333333',
          width: '840px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          borderRadius: '4px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          overflowY: 'auto',
          position: 'relative',
          padding: '24px 30px',
          fontFamily: '"Trebuchet MS", Arial, Helvetica, sans-serif',
          fontSize: '12px',
          lineHeight: 1.5
        }}
      >
        {/* Barra superior de herramientas (no imprimible) */}
        <div className="sbs-ficha-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#002469', color: '#ffffff', padding: '2px 8px', borderRadius: '3px', fontWeight: 'bold' }}>
              Portal Oficial SBS
            </span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              DNI: <strong>{worker.dni}</strong> — {apePat} {apeMat}, {nombres}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                background: '#2174E5',
                color: '#ffffff',
                border: 'none',
                padding: '4px 12px',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <Printer size={13} /> Imprimir Ficha
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                padding: '4px 8px',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
              title="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* CONTENEDOR EXACTO SBS (Sbs Ficha Canvas) */}
        <div className="sbs-print-area" style={{ background: '#ffffff', padding: '6px' }}>
          {isAfiliado ? (
            <div>
              {/* Título Principal */}
              <div style={{ borderBottom: '1px solid gray', paddingBottom: '4px', marginBottom: '10px' }}>
                <strong style={{ color: '#002469', fontSize: '13px', fontFamily: '"Century Gothic", Arial, Helvetica, sans-serif' }}>
                  REPORTE DE SITUACIÓN PREVISIONAL EN EL SISTEMA PRIVADO DE PENSIONES :
                </strong>
              </div>

              {/* Metadatos y Saludo */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
                <tbody>
                  <tr>
                    <td style={{ textAlign: 'left', color: '#2174e5', fontWeight: 'bold', fontSize: '12px', width: '35%' }}>
                      Información al:
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>
                      Información al : {fechaConsulta}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ textAlign: 'left', color: '#2174e5', fontWeight: 'bold', paddingTop: '6px', fontSize: '12px' }}>
                      Estimado usuario:
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ textAlign: 'left', color: '#2174e5', fontWeight: 'bold', fontSize: '12px', paddingBottom: '8px' }}>
                      Como resultado de la consulta realizada a través del Portal Web, se ha determinado lo siguiente:
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Tabla de Resultados de Afiliación */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
                <tbody>
                  <tr>
                    <td style={{ textAlign: 'left', color: '#2174e5', fontWeight: 'bold', padding: '3px 0', width: '55%' }}>
                      Se encuentra afiliado(a) al SPP desde el
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 0', fontFamily: 'Arial, sans-serif' }}>
                      {fechaAfiliacion}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', color: '#2174e5', fontWeight: 'bold', padding: '3px 0' }}>
                      Actualmente se encuentra afiliado(a) a
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 0', fontFamily: 'Arial, sans-serif', fontWeight: '500' }}>
                      {afpFormatted}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', color: '#2174e5', fontWeight: 'bold', padding: '3px 0' }}>
                      Su Código de Identificación del SPP es
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 0', fontFamily: 'Arial, sans-serif' }}>
                      {cuspp}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', color: '#2174e5', fontWeight: 'bold', padding: '3px 0' }}>
                      Su situación actual es
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 0', fontFamily: 'Arial, sans-serif' }}>
                      {situacion}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', color: '#2174e5', fontWeight: 'bold', padding: '3px 0' }}>
                      La fecha de devengue de su último aporte es
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 0', fontFamily: 'Arial, sans-serif' }}>
                      {fechaDevengue}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Recuadro MUY IMPORTANTE */}
              <div style={{ border: '1px solid gray', padding: '10px 14px', marginBottom: '12px' }}>
                <div style={{ textAlign: 'center', color: '#2174E5', fontWeight: 'bold', fontSize: '13px', letterSpacing: '4px', marginBottom: '8px' }}>
                  M U Y &nbsp;&nbsp; I M P O R T A N T E
                </div>
                <div style={{ textAlign: 'left', color: '#2174e5', textDecoration: 'underline', fontWeight: 'bold', fontSize: '12px', marginBottom: '3px' }}>
                  Situación del Afiliado
                </div>
                <p style={{ textAlign: 'justify', margin: '0 0 10px 0', fontSize: '11.5px', color: '#333333' }}>
                  {situacion.toUpperCase()}, según los datos que aparecen en la parte superior.
                </p>
                <div style={{ textAlign: 'left', color: '#2174e5', textDecoration: 'underline', fontWeight: 'bold', fontSize: '12px', marginBottom: '3px' }}>
                  Aportes Obligatorios
                </div>
                <p style={{ textAlign: 'justify', margin: '0 0 8px 0', fontSize: '11.5px', color: '#333333' }}>
                  De acuerdo a la información proporcionada por la AFP, durante los últimos seis (6) meses el afiliado no registra aportes obligatorios, motivo por el cual si el afiliado tiene la condición de trabajador dependiente y le han estado efectuando las retenciones correspondientes o, si tiene la condición de independiente y ha venido pagando sus aportes obligatorios, sería conveniente se ponga en contacto con la AFP para determinar la situación de los referidos aportes.
                </p>
                <p style={{ textAlign: 'justify', margin: 0, fontSize: '11.5px', color: '#333333' }}>
                  Recuerde que los aportes acreditados resultan necesarios para efectos de la evaluación de la cobertura del seguro previsional ante una contingencia de invalidez o fallecimiento.
                </p>
              </div>

              {/* Advertencia Legal Roja */}
              <div style={{ color: '#FF0000', textAlign: 'justify', fontSize: '11px', marginBottom: '16px' }}>
                En caso tuviera dudas con relación al presente documento, sirvase contactar a la Superintendencia al teléfono gratuito a nivel nacional : 0800-10840.
              </div>

              {/* Botones Ficticios de la SBS para completar fidelidad visual */}
              <div className="sbs-screen-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    backgroundColor: '#2174E5',
                    color: '#ffffff',
                    border: '1px solid #2174E5',
                    borderRadius: '.21428571em',
                    padding: '5px 16px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Consultar otro registro
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  style={{
                    backgroundColor: '#2174E5',
                    color: '#ffffff',
                    border: '1px solid #2174E5',
                    borderRadius: '.21428571em',
                    padding: '5px 16px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Imprimir
                </button>
              </div>
            </div>
          ) : (
            /* Caso NO REGISTRADO / NO FIGURA EN SPP */
            <div>
              <div style={{ background: '#2174e5', color: '#ffffff', padding: '6px 12px', borderRadius: '4px 4px 0 0', fontWeight: 'bold', fontSize: '12px' }}>
                BÚSQUEDA AFILIADO EN EL SISTEMA PRIVADO DE PENSIONES
              </div>
              <div style={{ border: '1px solid #bfc8d9', borderTop: 'none', padding: '16px', borderRadius: '0 0 4px 4px', background: '#f8fafc' }}>
                <div style={{ color: '#dc2626', fontSize: '11px', marginBottom: '12px' }}>
                  Aviso Importante: Ingrese datos sin considerar tildes.
                </div>

                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                  <tbody>
                    <tr>
                      <td style={{ textAlign: 'left', color: '#2174e5', width: '38%' }}>Tipo de Documento de Identidad</td>
                      <td>
                        <input type="text" readOnly value="DNI/Lib.Electoral" style={{ width: '220px', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '3px', background: '#f1f5f9', color: '#334155' }} />
                      </td>
                    </tr>
                    <tr>
                      <td style={{ textAlign: 'left', color: '#2174e5' }}>N° de Documento</td>
                      <td>
                        <input type="text" readOnly value={worker.dni} style={{ width: '220px', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '3px', background: '#f1f5f9', fontWeight: 'bold', color: '#1e293b' }} />
                      </td>
                    </tr>
                    <tr>
                      <td style={{ textAlign: 'left', color: '#2174e5' }}>Apellido Paterno</td>
                      <td>
                        <input type="text" readOnly value={apePat || '-'} style={{ width: '220px', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '3px', background: '#f1f5f9' }} />
                      </td>
                    </tr>
                    <tr>
                      <td style={{ textAlign: 'left', color: '#2174e5' }}>Apellido Materno</td>
                      <td>
                        <input type="text" readOnly value={apeMat || '-'} style={{ width: '220px', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '3px', background: '#f1f5f9' }} />
                      </td>
                    </tr>
                    <tr>
                      <td style={{ textAlign: 'left', color: '#2174e5' }}>Primer Nombre</td>
                      <td>
                        <input type="text" readOnly value={nombres || '-'} style={{ width: '220px', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '3px', background: '#f1f5f9' }} />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px', lineHeight: 1.4 }}>
                  Le informamos que los datos personales que proporcione serán tratados conforme a la Ley N° 29733 y su reglamento.
                </div>

                <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1' }}>
                  <div style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                    No se encontraron resultados
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    El ciudadano no registra afiliación vigente en el Sistema Privado de Pensiones (SPP).
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    Información al : {fechaConsulta}
                  </div>
                </div>
              </div>

              <div className="sbs-screen-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={handlePrint}
                  style={{
                    backgroundColor: '#2174E5',
                    color: '#ffffff',
                    border: '1px solid #2174E5',
                    borderRadius: '.21428571em',
                    padding: '5px 16px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Imprimir Constancia
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Estilos para impresión nativa idéntica a SBS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .sbs-ficha-backdrop {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .sbs-ficha-window {
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .sbs-print-area, .sbs-print-area * {
            visibility: visible !important;
          }
          .sbs-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }
          .sbs-ficha-toolbar, .sbs-screen-actions {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
