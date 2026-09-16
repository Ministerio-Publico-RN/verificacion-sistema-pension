import React, { useRef, useState, useEffect } from 'react';
import { X, Download, FileText, Image as ImageIcon, ChevronDown } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export function SbsFichaModal({ worker, onClose }) {
  if (!worker) return null;

  const printAreaRef = useRef(null);
  const dropdownRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState(null); // 'pdf' | 'png' | null
  const [showDropdown, setShowDropdown] = useState(false);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Descarga directa a PDF de 1 página exacta
  const handleDownloadPdf = async () => {
    if (!printAreaRef.current || downloading) return;
    setDownloading(true);
    setDownloadFormat('pdf');
    setShowDropdown(false);
    try {
      const canvas = await html2canvas(printAreaRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 36;
      const imgWidth = pageWidth - (margin * 2);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', margin, 36, imgWidth, imgHeight);
      pdf.save(`ficha_sbs_${worker.dni}.pdf`);
    } catch (err) {
      console.error('Error al generar PDF de ficha SBS:', err);
      alert('Hubo un error al generar el archivo PDF.');
    } finally {
      setDownloading(false);
      setDownloadFormat(null);
    }
  };

  // Descarga directa a imagen PNG
  const handleDownloadPng = async () => {
    if (!printAreaRef.current || downloading) return;
    setDownloading(true);
    setDownloadFormat('png');
    setShowDropdown(false);
    try {
      const canvas = await html2canvas(printAreaRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });
      const link = document.createElement('a');
      link.download = `ficha_sbs_${worker.dni}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Error al generar PNG de ficha SBS:', err);
      alert('Hubo un error al generar la imagen PNG.');
    } finally {
      setDownloading(false);
      setDownloadFormat(null);
    }
  };

  // Impresión limpia y aislada usando un iframe oculto (sin hojas en blanco)
  const handlePrint = () => {
    if (!printAreaRef.current) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Reporte de Situación Previsional - SBS</title>
          <meta charset="utf-8">
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm 20mm;
            }
            body {
              font-family: "Trebuchet MS", Arial, Helvetica, sans-serif;
              font-size: 12px;
              line-height: 1.5;
              color: #333333;
              margin: 0;
              padding: 0;
              background: #ffffff;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            td {
              vertical-align: top;
            }
            .sbs-screen-actions {
              display: none !important;
            }
            input[type="text"] {
              border: 1px solid #cbd5e1;
              padding: 4px 8px;
              background: #f1f5f9;
              font-family: inherit;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          ${printAreaRef.current.innerHTML}
        </body>
      </html>
    `);
    iframeDoc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch (_) {}
      }, 1000);
    }, 250);
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
        {/* Barra superior de herramientas: SOLO "Descargar ficha" y cerrar (sin botón imprimir arriba) */}
        <div className="sbs-ficha-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#002469', color: '#ffffff', padding: '2px 8px', borderRadius: '3px', fontWeight: 'bold' }}>
              Portal Oficial SBS
            </span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              DNI: <strong>{worker.dni}</strong> — {apePat} {apeMat}, {nombres}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Botón Descargar Ficha con opciones PDF y PNG */}
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowDropdown(prev => !prev)}
                disabled={downloading}
                style={{
                  background: '#2174E5',
                  color: '#ffffff',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '3px',
                  cursor: downloading ? 'wait' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Descargar Ficha en PDF o PNG"
              >
                <Download size={13} />
                {downloading ? `Generando ${downloadFormat?.toUpperCase()}...` : 'Descargar ficha'}
                <ChevronDown size={12} />
              </button>

              {showDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    background: '#ffffff',
                    borderRadius: '4px',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
                    border: '1px solid #cbd5e1',
                    zIndex: 120,
                    minWidth: '165px',
                    overflow: 'hidden'
                  }}
                >
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '9px 12px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: '12px',
                      color: '#1e293b',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <FileText size={15} color="#dc2626" />
                    <span>Descargar <strong>PDF</strong></span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPng}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '9px 12px',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: '12px',
                      color: '#1e293b',
                      cursor: 'pointer',
                      borderTop: '1px solid #f1f5f9'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <ImageIcon size={15} color="#2563eb" />
                    <span>Descargar <strong>PNG</strong></span>
                  </button>
                </div>
              )}
            </div>

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
        <div className="sbs-print-area" ref={printAreaRef} style={{ background: '#ffffff', padding: '6px' }}>
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

              {/* Botones Fieles a la SBS: "Consultar otro registro" e "Imprimir" tal como estaban originalmente */}
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

              {/* Botón Fiel a la SBS: solo Imprimir en la parte inferior */}
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
    </div>
  );
}
