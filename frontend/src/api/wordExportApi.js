import { Document, Packer, Paragraph, TextRun, ImageRun } from 'docx';
import html2canvas from 'html2canvas';
import { downloadBlob } from './exportApi';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateSbsFichaHtml(worker) {
  const sbs = worker.sbs_resultado || {};
  const isAfiliado = sbs.afiliado_spp === true ||
    sbs.estado_sbs === 'ENCONTRADO' ||
    ['PROFUTURO', 'INTEGRA', 'PRIMA', 'HABITAT'].includes((sbs.afp || '').toUpperCase());

  // Extraer nombres y apellidos
  let apePat = worker.ape_paterno || worker.paterno || '';
  let apeMat = worker.ape_materno || worker.materno || '';
  let nombres = worker.nombres || (worker.primer_nombre ? `${worker.primer_nombre || ''} ${worker.segundo_nombre || ''}`.trim() : '');

  if (!apePat && !apeMat && (worker.apellidos_nombres || worker.nombre_completo)) {
    const full = (worker.apellidos_nombres || worker.nombre_completo).trim();
    if (full.includes(',')) {
      const [apels, noms] = full.split(',');
      const parts = apels.trim().split(/\s+/);
      apePat = parts[0] || '';
      apeMat = parts.slice(1).join(' ') || '';
      nombres = (noms || '').trim();
    } else {
      const parts = full.split(/\s+/);
      if (parts.length >= 3) {
        apePat = parts[0];
        apeMat = parts[1];
        nombres = parts.slice(2).join(' ');
      } else {
        apePat = parts[0] || '';
        nombres = parts.slice(1).join(' ') || '';
      }
    }
  }

  const rawAfp = sbs.afp || '';
  const afpFormatted = rawAfp ? rawAfp.charAt(0).toUpperCase() + rawAfp.slice(1).toLowerCase() : 'No registrado';
  const fechaConsulta = sbs.fecha_consulta || new Date().toLocaleString('es-PE', { hour12: false });
  const fechaAfiliacion = sbs.fecha_afiliacion && sbs.fecha_afiliacion !== '-' ? sbs.fecha_afiliacion : (worker.afiliacion_siga || '-');
  const cuspp = sbs.cuspp && sbs.cuspp !== '-' ? sbs.cuspp : (worker.cuspp || '-');
  const situacion = sbs.situacion && sbs.situacion !== '-' ? sbs.situacion : 'Afiliado';
  const fechaDevengue = sbs.fecha_devengue || 'No hay datos';

  if (isAfiliado) {
    return `
      <div style="background:#ffffff; padding:10px; font-family:'Trebuchet MS', Arial, sans-serif; font-size:12px; line-height:1.45; color:#333333;">
        <div style="border-bottom:1px solid #777777; padding-bottom:4px; margin-bottom:10px;">
          <strong style="color:#002469; font-size:13px; font-family:'Century Gothic', Arial, sans-serif;">
            REPORTE DE SITUACIÓN PREVISIONAL EN EL SISTEMA PRIVADO DE PENSIONES :
          </strong>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">
          <tbody>
            <tr>
              <td style="text-align:left; color:#2174e5; font-weight:bold; font-size:12px; width:35%;">Información al:</td>
              <td style="text-align:right; font-weight:bold; font-size:12px;">Información al : ${escapeHtml(fechaConsulta)}</td>
            </tr>
            <tr>
              <td colspan="2" style="text-align:left; color:#2174e5; font-weight:bold; padding-top:6px; font-size:12px;">Estimado usuario:</td>
            </tr>
            <tr>
              <td colspan="2" style="text-align:left; color:#2174e5; font-weight:bold; font-size:12px; padding-bottom:6px;">
                Como resultado de la consulta realizada a través del Portal Web, se ha determinado lo siguiente:
              </td>
            </tr>
          </tbody>
        </table>

        <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
          <tbody>
            <tr>
              <td style="text-align:left; color:#2174e5; font-weight:bold; padding:3px 0; width:55%;">Se encuentra afiliado(a) al SPP desde el</td>
              <td style="text-align:right; padding:3px 0; font-family:Arial, sans-serif;">${escapeHtml(fechaAfiliacion)}</td>
            </tr>
            <tr>
              <td style="text-align:left; color:#2174e5; font-weight:bold; padding:3px 0;">Actualmente se encuentra afiliado(a) a</td>
              <td style="text-align:right; padding:3px 0; font-family:Arial, sans-serif; font-weight:500;">${escapeHtml(afpFormatted)}</td>
            </tr>
            <tr>
              <td style="text-align:left; color:#2174e5; font-weight:bold; padding:3px 0;">Su Código de Identificación del SPP es</td>
              <td style="text-align:right; padding:3px 0; font-family:Arial, sans-serif;">${escapeHtml(cuspp)}</td>
            </tr>
            <tr>
              <td style="text-align:left; color:#2174e5; font-weight:bold; padding:3px 0;">Su situación actual es</td>
              <td style="text-align:right; padding:3px 0; font-family:Arial, sans-serif;">${escapeHtml(situacion)}</td>
            </tr>
            <tr>
              <td style="text-align:left; color:#2174e5; font-weight:bold; padding:3px 0;">La fecha de devengue de su último aporte es</td>
              <td style="text-align:right; padding:3px 0; font-family:Arial, sans-serif;">${escapeHtml(fechaDevengue)}</td>
            </tr>
          </tbody>
        </table>

        <div style="border:1px solid #777777; padding:10px 14px; margin-bottom:12px;">
          <div style="text-align:center; color:#2174E5; font-weight:bold; font-size:13px; letter-spacing:4px; margin-bottom:8px;">
            M U Y &nbsp;&nbsp; I M P O R T A N T E
          </div>
          <div style="text-align:left; color:#2174e5; text-decoration:underline; font-weight:bold; font-size:12px; margin-bottom:3px;">
            Situación del Afiliado
          </div>
          <p style="text-align:justify; margin:0 0 10px 0; font-size:11px; color:#333333;">
            ${escapeHtml(situacion.toUpperCase())}, según los datos que aparecen en la parte superior.
          </p>
          <div style="text-align:left; color:#2174e5; text-decoration:underline; font-weight:bold; font-size:12px; margin-bottom:3px;">
            Aportes Obligatorios
          </div>
          <p style="text-align:justify; margin:0 0 8px 0; font-size:11px; color:#333333;">
            De acuerdo a la información proporcionada por la AFP, durante los últimos seis (6) meses el afiliado no registra aportes obligatorios, motivo por el cual si el afiliado tiene la condición de trabajador dependiente y le han estado efectuando las retenciones correspondientes o, si tiene la condición de independiente y ha venido pagando sus aportes obligatorios, sería conveniente se ponga en contacto con la AFP para determinar la situación de los referidos aportes.
          </p>
          <p style="text-align:justify; margin:0; font-size:11px; color:#333333;">
            Recuerde que los aportes acreditados resultan necesarios para efectos de la evaluación de la cobertura del seguro previsional ante una contingencia de invalidez o fallecimiento.
          </p>
        </div>

        <div style="color:#FF0000; text-align:justify; font-size:11px;">
          En caso tuviera dudas con relación al presente documento, sirvase contactar a la Superintendencia al teléfono gratuito a nivel nacional : 0800-10840.
        </div>
      </div>
    `;
  }

  // Caso No Registrado en SPP
  return `
    <div style="background:#ffffff; padding:10px; font-family:'Trebuchet MS', Arial, sans-serif; font-size:12px; line-height:1.45; color:#333333;">
      <div style="background:#2174e5; color:#ffffff; padding:6px 12px; border-radius:4px 4px 0 0; font-weight:bold; font-size:12px;">
        BÚSQUEDA AFILIADO EN EL SISTEMA PRIVADO DE PENSIONES
      </div>
      <div style="border:1px solid #bfc8d9; border-top:none; padding:16px; border-radius:0 0 4px 4px; background:#f8fafc;">
        <div style="color:#dc2626; font-size:11px; margin-bottom:12px;">
          Aviso Importante: Ingrese datos sin considerar tildes.
        </div>

        <table style="width:100%; font-size:12px; border-collapse:separate; border-spacing:0 8px;">
          <tbody>
            <tr>
              <td style="text-align:left; color:#2174e5; width:38%;">Tipo de Documento de Identidad</td>
              <td>
                <span style="display:inline-block; width:220px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:3px; background:#f1f5f9; color:#334155;">DNI/Lib.Electoral</span>
              </td>
            </tr>
            <tr>
              <td style="text-align:left; color:#2174e5;">N° de Documento</td>
              <td>
                <span style="display:inline-block; width:220px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:3px; background:#f1f5f9; font-weight:bold; color:#1e293b;">${escapeHtml(worker.dni || '')}</span>
              </td>
            </tr>
            <tr>
              <td style="text-align:left; color:#2174e5;">Apellido Paterno</td>
              <td>
                <span style="display:inline-block; width:220px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:3px; background:#f1f5f9; color:#334155;">${escapeHtml(apePat || '-')}</span>
              </td>
            </tr>
            <tr>
              <td style="text-align:left; color:#2174e5;">Apellido Materno</td>
              <td>
                <span style="display:inline-block; width:220px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:3px; background:#f1f5f9; color:#334155;">${escapeHtml(apeMat || '-')}</span>
              </td>
            </tr>
            <tr>
              <td style="text-align:left; color:#2174e5;">Primer Nombre</td>
              <td>
                <span style="display:inline-block; width:220px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:3px; background:#f1f5f9; color:#334155;">${escapeHtml(nombres || '-')}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div style="font-size:11px; color:#64748b; margin-top:8px; line-height:1.4;">
          Le informamos que los datos personales que proporcione serán tratados conforme a la Ley N° 29733 y su reglamento.
        </div>

        <div style="text-align:center; margin-top:16px; padding-top:12px; border-top:1px dashed #cbd5e1;">
          <div style="color:#dc2626; font-weight:bold; font-size:14px; margin-bottom:4px;">
            No se encontraron resultados
          </div>
          <div style="font-size:11px; color:#64748b;">
            El ciudadano no registra afiliación vigente en el Sistema Privado de Pensiones (SPP).
          </div>
          <div style="font-size:11px; color:#94a3b8; margin-top:4px;">
            Información al : ${escapeHtml(fechaConsulta)}
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function exportCierreAltasWord(workers, onProgress) {
  if (!workers || workers.length === 0) {
    throw new Error('No hay trabajadores para exportar.');
  }

  // Contenedor temporal aislado fuera de la vista para renderizado de fichas
  const container = document.createElement('div');
  container.id = 'sbs-ficha-word-renderer';
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '750px';
  container.style.background = '#ffffff';
  container.style.zIndex = '-9999';
  container.style.boxSizing = 'border-box';
  document.body.appendChild(container);

  const children = [];

  try {
    for (let i = 0; i < workers.length; i++) {
      const worker = workers[i];
      onProgress?.(i + 1, workers.length, worker);

      // Renderizar el HTML de la ficha en el contenedor
      container.innerHTML = generateSbsFichaHtml(worker);

      // Breve pausa para asegurar renderizado de fuentes y estilos en el DOM
      await new Promise(resolve => setTimeout(resolve, 40));

      const canvas = await html2canvas(container, {
        scale: 1.5,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false
      });

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const workerName = (
        worker.apellidos_nombres ||
        worker.nombre_completo ||
        `${worker.ape_paterno || worker.paterno || ''} ${worker.ape_materno || worker.materno || ''}, ${worker.nombres || worker.primer_nombre || ''}`
      ).trim().toUpperCase();

      // Dimensiones para la hoja Word (adaptado para 2 fichas por página A4 sin desborde)
      const imgWidth = 490;
      const imgHeight = Math.round(490 * (canvas.height / canvas.width));

      // Nombre y DNI en la misma línea, con salto de página cada 2 trabajadores
      children.push(
        new Paragraph({
          pageBreakBefore: (i > 0 && i % 2 === 0),
          children: [
            new TextRun({
              text: `Nombre: `,
              bold: true,
              size: 21, // ~10.5pt
              font: 'Calibri',
              color: '0F172A'
            }),
            new TextRun({
              text: `${workerName}   —   `,
              bold: true,
              size: 21,
              font: 'Calibri',
              color: '0F172A'
            }),
            new TextRun({
              text: `DNI: `,
              bold: true,
              size: 21,
              font: 'Calibri',
              color: '2563EB'
            }),
            new TextRun({
              text: `${worker.dni || '-'}`,
              bold: true,
              size: 21,
              font: 'Calibri',
              color: '2563EB'
            })
          ],
          spacing: { before: (i % 2 === 0) ? 0 : 120, after: 50 }
        }),
        new Paragraph({
          children: [
            new ImageRun({
              data: uint8Array,
              transformation: {
                width: imgWidth,
                height: imgHeight
              }
            })
          ],
          spacing: { after: 100 }
        })
      );
    }
  } finally {
    try {
      document.body.removeChild(container);
    } catch (_) {}
  }

  // Generar documento .docx con márgenes optimizados para 2 trabajadores por hoja
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 500, // ~0.35 pulgada
            bottom: 500,
            left: 550,
            right: 550
          }
        }
      },
      children
    }]
  });

  const docBlob = await Packer.toBlob(doc);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadBlob(
    docBlob,
    `reporte_cierre_altas_${timestamp}.docx`,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}
