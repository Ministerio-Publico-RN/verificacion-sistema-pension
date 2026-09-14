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
