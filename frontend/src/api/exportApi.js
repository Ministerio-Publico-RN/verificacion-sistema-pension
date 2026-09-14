/**
 * Generador y exportador de reportes en el cliente respetando las columnas visibles
 */

export function exportVisibleReport(format = 'xlsx', workers = [], visibleColumns = {}) {
  if (!workers || workers.length === 0) {
    alert('No hay registros para exportar.');
    return;
  }

  // Definición de columnas exportables con sus getters
  const columnDefs = [
    { key: 'num', label: 'N°', get: (w) => w.num },
    { key: 'dni', label: 'DNI', get: (w) => `"${w.dni || ''}"` },
    { key: 'worker', label: 'APELLIDOS Y NOMBRES', get: (w) => `"${w.apellidos_nombres || w.nombre_completo || ''}"` },
    { key: 'siga', label: 'REGIMEN SIGA', get: (w) => `"${w.previsiona_siga || ''}"` },
    { key: 'afiliacion', label: 'FECHA AFILIACION SIGA', get: (w) => `"${w.afiliacion_siga || ''}"` },
    { key: 'cuspp', label: 'CUSPP', get: (w) => `"${w.cuspp_siga || w.sbs_resultado?.cuspp || ''}"` },
    { key: 'sbs', label: 'CONSULTA SBS', get: (w) => `"${w.sbs_resultado?.afp || (w.sbs_resultado ? 'CONSULTADO' : 'SIN CONSULTAR')}"` },
    { key: 'semaforo', label: 'ESTADO VALIDACION', get: (w) => `"${w.semaforo_texto ? w.semaforo_texto.replace(/\n/g, ' ') : (w.semaforo || 'PENDIENTE')}"` },
    { key: 'afpnet', label: 'CONSULTA AFPNET', get: (w) => `"${w.afpnet_resultado?.afp || w.afpnet_resultado?.estado || '-'}"` },
    { key: 'nacim', label: 'FECHA NACIMIENTO', get: (w) => `"${w.fecha_nacimiento || ''}"` },
    { key: 'cargo', label: 'CARGO / DEPENDENCIA', get: (w) => `"${w.cargo || ''}"` }
  ];

  // Filtrar solo las columnas activas
  const activeCols = columnDefs.filter(c => visibleColumns[c.key] !== false);
  if (activeCols.length === 0) {
    alert('Debe tener al menos una columna seleccionada para exportar.');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (format === 'csv') {
    const headers = activeCols.map(c => `"${c.label}"`).join(';');
    const rows = workers.map(w => activeCols.map(c => c.get(w)).join(';'));
    const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
    downloadBlob(csvContent, `reporte_previsional_${timestamp}.csv`, 'text/csv;charset=utf-8;');
  } else {
    // Formato Excel HTML table compatible directo con Microsoft Excel (.xls)
    const headersHtml = activeCols.map(c => `<th style="background:#0f1f38;color:#ffffff;border:1px solid #ddd;padding:6px;">${c.label}</th>`).join('');
    const rowsHtml = workers.map(w => {
      const cells = activeCols.map(c => `<td style="border:1px solid #ddd;padding:5px;">${String(c.get(w)).replace(/^"|"$/g, '')}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"/><title>Reporte Previsional MPFN</title></head>
      <body>
        <table border="1">
          <thead><tr>${headersHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body></html>
    `;
    downloadBlob(excelHtml, `reporte_previsional_${timestamp}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
  }
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportAfiliacionReport(workers = []) {
  if (!workers || workers.length === 0) {
    alert('No hay registros sin afiliación para exportar.');
    return;
  }

  const rowsXml = workers.map(w => {
    const dni = String(w.dni || '').trim().padStart(8, '0');
    
    let paterno = (w.ape_paterno || '').trim().toUpperCase();
    let materno = (w.ape_materno || '').trim().toUpperCase();
    let nombres = (w.nombres || `${w.primer_nombre || ''} ${w.segundo_nombre || ''}`).trim().toUpperCase();

    if (!paterno && !materno && (w.apellidos_nombres || w.nombre_completo)) {
      const full = (w.apellidos_nombres || w.nombre_completo).trim();
      if (full.includes(',')) {
        const [apels, noms] = full.split(',');
        const apelParts = apels.trim().split(/\s+/);
        paterno = apelParts[0] || '';
        materno = apelParts.slice(1).join(' ') || '';
        nombres = (noms || '').trim();
      } else {
        const parts = full.split(/\s+/);
        if (parts.length >= 3) {
          paterno = parts[0];
          materno = parts[1];
          nombres = parts.slice(2).join(' ');
        } else {
          paterno = parts[0] || '';
          nombres = parts.slice(1).join(' ') || '';
        }
      }
    }

    const fecNac = (w.fecha_nacimiento || '').trim();
    const email = (w.email || w.correo || w.raw_data?.EMAIL || w.raw_data?.CORREO || '').trim();
    const telMovil = (w.celular || w.telefono || w.raw_data?.CELULAR || w.raw_data?.TELEFONO || '').trim();
    const ubigeo = (w.ubigeo || w.raw_data?.UBIGEO || '').trim();

    return `   <Row>
    <Cell><Data ss:Type="String">0</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(dni)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(nombres)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(paterno)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(materno)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(fecNac)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(email)}</Data></Cell>
    <Cell><Data ss:Type="String"></Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(telMovil)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(ubigeo)}</Data></Cell>
    <Cell><Data ss:Type="String"></Data></Cell>
    <Cell><Data ss:Type="String"></Data></Cell>
    <Cell><Data ss:Type="String"></Data></Cell>
    <Cell><Data ss:Type="String"></Data></Cell>
    <Cell><Data ss:Type="String">20131370301</Data></Cell>
    <Cell><Data ss:Type="String">MINISTERIO PUBLICO-GERENCIA GENERAL</Data></Cell>
    <Cell><Data ss:Type="String"></Data></Cell>
    <Cell><Data ss:Type="String">1</Data></Cell>
   </Row>`;
  }).join('\n');

  const xmlContent = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="Excel">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Tipo  de documento de identidad</Data></Cell>
    <Cell><Data ss:Type="String">Número de Documento de Identidad</Data></Cell>
    <Cell><Data ss:Type="String">Nombres</Data></Cell>
    <Cell><Data ss:Type="String">Apellido Paterno</Data></Cell>
    <Cell><Data ss:Type="String">Apellido Materno</Data></Cell>
    <Cell><Data ss:Type="String">Fecha de Nacimiento</Data></Cell>
    <Cell><Data ss:Type="String">Mail Principal</Data></Cell>
    <Cell><Data ss:Type="String">Teléfono Fijo</Data></Cell>
    <Cell><Data ss:Type="String">Teléfono Móvil</Data></Cell>
    <Cell><Data ss:Type="String">Ubigeo</Data></Cell>
    <Cell><Data ss:Type="String">Tipo Vía</Data></Cell>
    <Cell><Data ss:Type="String">Nombre Vía</Data></Cell>
    <Cell><Data ss:Type="String">Tipo Localidad</Data></Cell>
    <Cell><Data ss:Type="String">Nombre Localidad</Data></Cell>
    <Cell><Data ss:Type="String">RUC</Data></Cell>
    <Cell><Data ss:Type="String">Razón Social</Data></Cell>
    <Cell><Data ss:Type="String">Usuario Agente</Data></Cell>
    <Cell><Data ss:Type="String">Origen ONP</Data></Cell>
   </Row>
${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadBlob(xmlContent, `reporte_afiliacion_${timestamp}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
