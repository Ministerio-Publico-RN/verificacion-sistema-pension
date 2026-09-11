/**
 * Sistema de Verificación Previsional - MPFN
 * Lógica del Cliente Frontend
 */

document.addEventListener('DOMContentLoaded', () => {
  // Estado de la aplicación
  const state = {
    workers: [],
    filteredWorkers: [],
    currentPage: 1,
    pageSize: 15,
    activeSources: {
      sbs: true,
      afpnet: true,
      onp: false
    },
    filterStatus: 'all',
    searchQuery: '',
    scrapingConfig: {
      concurrency: 1,
      delayMs: 1200
    },
    visibleColumns: {
      'col-num': true,
      'col-trabajador': true,
      'col-nacim': true,
      'col-siga': true,
      'col-sbs': true,
      'col-afpnet': true,
      'col-onp': false,
      'col-cuspp': true,
      'col-semaforo': true
    }
  };

  // Elementos del DOM
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const btnBrowseFile = document.getElementById('btnBrowseFile');
  const btnLoadSample = document.getElementById('btnLoadSample');
  const loadedFileBar = document.getElementById('loadedFileBar');
  const loadedFileName = document.getElementById('loadedFileName');
  const loadedFileMeta = document.getElementById('loadedFileMeta');
  const btnClearFile = document.getElementById('btnClearFile');

  const metricsSection = document.getElementById('metricsSection');
  const statTotal = document.getElementById('statTotal');
  const statSPP = document.getElementById('statSPP');
  const statSNP = document.getElementById('statSNP');
  const statDiscrepancias = document.getElementById('statDiscrepancias');

  const tableSection = document.getElementById('tableSection');
  const workersTbody = document.getElementById('workersTbody');
  const searchInput = document.getElementById('searchInput');
  const filterStatus = document.getElementById('filterStatus');
  const showingStart = document.getElementById('showingStart');
  const showingEnd = document.getElementById('showingEnd');
  const showingTotal = document.getElementById('showingTotal');
  const paginationControls = document.getElementById('paginationControls');

  const btnToggleColumns = document.getElementById('btnToggleColumns');
  const columnsDropdown = document.getElementById('columnsDropdown');
  
  // Elementos de Exportación
  const btnExportToggle = document.getElementById('btnExportToggle');
  const exportDropdown = document.getElementById('exportDropdown');
  const btnExportExcel = document.getElementById('btnExportExcel');
  const btnExportPDF = document.getElementById('btnExportPDF');
  const btnExportCSV = document.getElementById('btnExportCSV');

  // Elementos de Verificación y Scraping
  const btnStartVerify = document.getElementById('btnStartVerify');
  const btnScrapingConfig = document.getElementById('btnScrapingConfig');
  const configModalBackdrop = document.getElementById('configModalBackdrop');
  const btnCloseConfigModal = document.getElementById('btnCloseConfigModal');
  const btnCancelConfig = document.getElementById('btnCancelConfig');
  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const cfgDelay = document.getElementById('cfgDelay');

  const checkSourceSBS = document.getElementById('checkSourceSBS');
  const checkSourceAFPNET = document.getElementById('checkSourceAFPNET');
  const checkSourceONP = document.getElementById('checkSourceONP');
  const sourceSBSLabel = document.getElementById('sourceSBSLabel');
  const sourceAFPNETLabel = document.getElementById('sourceAFPNETLabel');
  const sourceONPLabel = document.getElementById('sourceONPLabel');

  // ==========================================
  // 1. Inicialización y Conectividad
  // ==========================================
  fetch('/api/status')
    .then(res => res.json())
    .then(data => {
      console.log('Servidor local conectado:', data);
    })
    .catch(err => {
      console.warn('Error al verificar servidor local:', err);
    });

  // ==========================================
  // 2. Switches de Fuentes
  // ==========================================
  function setupSourceToggles() {
    checkSourceSBS.addEventListener('change', (e) => {
      state.activeSources.sbs = e.target.checked;
      sourceSBSLabel.classList.toggle('active', e.target.checked);
    });

    checkSourceAFPNET.addEventListener('change', (e) => {
      state.activeSources.afpnet = e.target.checked;
      sourceAFPNETLabel.classList.toggle('active', e.target.checked);
    });

    // Opción ONP deshabilitada
    if (checkSourceONP) {
      checkSourceONP.disabled = true;
      checkSourceONP.checked = false;
      state.activeSources.onp = false;
    }
  }
  setupSourceToggles();

  // ==========================================
  // 3. Drag & Drop y Carga de Archivos
  // ==========================================
  dropzone.addEventListener('click', () => fileInput.click());
  btnBrowseFile.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  ['dragenter', 'dragover'].forEach(event => {
    dropzone.addEventListener(event, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(event => {
    dropzone.addEventListener(event, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      uploadFile(e.target.files[0]);
    }
  });

  // Carga del archivo de muestra
  btnLoadSample.addEventListener('click', async () => {
    btnLoadSample.disabled = true;
    btnLoadSample.innerHTML = `
      <svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"></circle>
      </svg>
      Cargando altas cas set 2026.DBF...
    `;

    try {
      const res = await fetch('/api/load-sample');
      const data = await res.json();
      if (data.success) {
        setWorkersData(data.data, data.filename);
      } else {
        alert('Error al cargar archivo de muestra: ' + (data.error || 'Error desconocido'));
      }
    } catch (err) {
      alert('Error de conexión con el servidor local: ' + err.message);
    } finally {
      btnLoadSample.disabled = false;
      btnLoadSample.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
        Cargar Reporte de Altas CAS (docs/altas cas set 2026.DBF)
      `;
    }
  });

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const originalText = dropzone.querySelector('.dropzone-title').textContent;
    dropzone.querySelector('.dropzone-title').textContent = `Subiendo y procesando ${file.name}...`;

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setWorkersData(data.data, data.filename);
      } else {
        alert('Error al procesar archivo: ' + (data.error || 'Desconocido'));
      }
    } catch (err) {
      alert('Error al subir archivo: ' + err.message);
    } finally {
      dropzone.querySelector('.dropzone-title').textContent = originalText;
    }
  }

  // Quitar archivo
  btnClearFile.addEventListener('click', () => {
    state.workers = [];
    state.filteredWorkers = [];
    loadedFileBar.classList.add('hidden');
    metricsSection.classList.add('hidden');
    tableSection.classList.add('hidden');
    fileInput.value = '';
  });

  // ==========================================
  // 4. Procesamiento de Datos y Métricas
  // ==========================================
  function setWorkersData(workersList, filename) {
    state.workers = workersList.map((w, idx) => {
      // Estado de semáforo inicial basado en datos SIGA
      const prev = (w.previsiona_siga || '').toUpperCase();
      let semaforoInicial = 'pending';
      let semaforoTexto = 'Por verificar';

      return {
        ...w,
        index: idx + 1,
        sbs_resultado: null,
        afpnet_resultado: null,
        onp_resultado: null,
        semaforo: semaforoInicial,
        semaforo_texto: semaforoTexto
      };
    });

    // Mostrar barra de archivo
    loadedFileName.textContent = filename;
    loadedFileMeta.textContent = `${state.workers.length} trabajadores cargados e indexados correctamente`;
    loadedFileBar.classList.remove('hidden');

    // Mostrar métricas y tabla
    metricsSection.classList.remove('hidden');
    tableSection.classList.remove('hidden');

    updateMetrics();
    applyFilters();
  }

  function updateMetrics() {
    const total = state.workers.length;
    let spp = 0;
    let snp = 0;
    let discrepancias = 0;

    state.workers.forEach(w => {
      const p = (w.previsiona_siga || '').toUpperCase();
      if (['INTEGRA', 'PRIMA', 'PROFUTURO', 'HABITAT'].some(afp => p.includes(afp))) {
        spp++;
      } else if (p.includes('SNP') || p.includes('ONP') || p.includes('19990')) {
        snp++;
      }

      if (w.semaforo === 'discrepancia') {
        discrepancias++;
      }
    });

    statTotal.textContent = total;
    statSPP.textContent = spp;
    statSNP.textContent = snp;
    statDiscrepancias.textContent = discrepancias;
  }

  // ==========================================
  // 5. Filtros y Búsqueda
  // ==========================================
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    state.currentPage = 1;
    applyFilters();
  });

  filterStatus.addEventListener('change', (e) => {
    state.filterStatus = e.target.value;
    state.currentPage = 1;
    applyFilters();
  });

  function applyFilters() {
    state.filteredWorkers = state.workers.filter(w => {
      // Búsqueda textual
      const matchesSearch = !state.searchQuery ||
        (w.dni && w.dni.includes(state.searchQuery)) ||
        (w.nombre_completo && w.nombre_completo.toLowerCase().includes(state.searchQuery)) ||
        (w.previsiona_siga && w.previsiona_siga.toLowerCase().includes(state.searchQuery));

      if (!matchesSearch) return false;

      // Filtro de estado
      if (state.filterStatus === 'all') return true;
      if (state.filterStatus === 'discrepancia') return w.semaforo === 'discrepancia';
      if (state.filterStatus === 'coincidente') return w.semaforo === 'coincidente';
      if (state.filterStatus === 'sin_afiliacion') return w.semaforo === 'sin_afiliacion';

      return true;
    });

    renderTable();
  }

  // ==========================================
  // 6. Renderizado de la Tabla y Paginación
  // ==========================================
  function renderTable() {
    const total = state.filteredWorkers.length;
    const startIdx = (state.currentPage - 1) * state.pageSize;
    const endIdx = Math.min(startIdx + state.pageSize, total);
    const pageItems = state.filteredWorkers.slice(startIdx, endIdx);

    showingStart.textContent = total > 0 ? startIdx + 1 : 0;
    showingEnd.textContent = endIdx;
    showingTotal.textContent = total;

    workersTbody.innerHTML = '';

    if (pageItems.length === 0) {
      workersTbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 32px; color: var(--text-muted);">
            No se encontraron trabajadores con los filtros aplicados.
          </td>
        </tr>
      `;
      renderPagination(0);
      return;
    }

    pageItems.forEach(w => {
      const tr = document.createElement('tr');

      // Clases del semáforo
      let semaforoClass = 'badge-pending';
      if (w.semaforo === 'coincidente') semaforoClass = 'semaforo-verde';
      else if (w.semaforo === 'discrepancia') semaforoClass = 'semaforo-rojo';
      else if (w.semaforo === 'sin_afiliacion') semaforoClass = 'semaforo-azul';
      else if (w.semaforo === 'latencia' || w.semaforo === 'error') semaforoClass = 'semaforo-naranja';

      // Textos de fuentes
      const sbsText = w.sbs_resultado ? (w.sbs_resultado.afp || w.sbs_resultado.estado_sbs) : '<span style="color: #94A3B8;">Sin consultar</span>';

      // Fuente AFPNET
      let afpnetText = '<span style="color: #94A3B8;">Sin consultar</span>';
      if (w.afpnet_resultado) {
        const afp = (w.afpnet_resultado.afp || '').toUpperCase();
        let badgeClass = 'badge-afp-none';
        if (afp.includes('PROFUTURO')) badgeClass = 'badge-afp-profuturo';
        else if (afp.includes('INTEGRA')) badgeClass = 'badge-afp-integra';
        else if (afp.includes('PRIMA')) badgeClass = 'badge-afp-prima';
        else if (afp.includes('HABITAT')) badgeClass = 'badge-afp-habitat';

        const com = w.afpnet_resultado.tipo_comision && w.afpnet_resultado.tipo_comision !== '-' ?
          `<div style="font-size:10px; color:#475569; margin-top:2px;">${w.afpnet_resultado.tipo_comision} (${w.afpnet_resultado.pct_comision || '0'}%)</div>` : '';
        afpnetText = `
          <div>
            <span class="badge-afp ${badgeClass}">${afp}</span>
            ${com}
          </div>
        `;
      }

      const onpText = w.onp_resultado ? w.onp_resultado.estado : '<span style="color: #94A3B8;">-</span>';

      const btnActionText = (w.semaforo === 'latencia' || w.semaforo === 'error') ? 'Reintentar' : 'Ver detalle';
      const btnActionClass = (w.semaforo === 'latencia' || w.semaforo === 'error') ? 'btn-outline-danger' : 'btn-outline-secondary';

      tr.innerHTML = `
        <td class="col-num">${w.index}</td>
        <td class="col-trabajador">
          <div class="worker-cell">
            <span class="worker-cell-name">${w.nombre_completo}</span>
            <span class="worker-cell-dni"><span class="dni-tag">DNI</span> ${w.dni}</span>
          </div>
        </td>
        <td class="col-nacim">${w.fecha_nacimiento || '-'}</td>
        <td class="col-siga"><span class="badge" style="background:#F1F5F9; padding:3px 8px; border-radius:4px; font-weight:600;">${w.previsiona_siga || 'SIN REGISTRO'}</span></td>
        <td class="col-sbs">${sbsText}</td>
        <td class="col-afpnet">${afpnetText}</td>
        <td class="col-onp">${onpText}</td>
        <td class="col-cuspp"><code>${w.cuspp_siga || '-'}</code></td>
        <td class="col-semaforo">
          <span class="semaforo-badge ${semaforoClass}">${w.semaforo_texto}</span>
        </td>
        <td class="col-acciones">
          <button class="btn ${btnActionClass} btn-xs btn-inspect-worker" data-dni="${w.dni}" title="Inspeccionar trabajador">
            ${btnActionText}
          </button>
        </td>
      `;

      workersTbody.appendChild(tr);
    });

    applyColumnVisibility();
    renderPagination(total);
  }

  function renderPagination(total) {
    paginationControls.innerHTML = '';
    const totalPages = Math.ceil(total / state.pageSize);
    if (totalPages <= 1) return;

    // Botón Anterior
    const btnPrev = document.createElement('button');
    btnPrev.className = 'page-btn';
    btnPrev.textContent = '« Anterior';
    btnPrev.disabled = state.currentPage === 1;
    btnPrev.addEventListener('click', () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        renderTable();
      }
    });
    paginationControls.appendChild(btnPrev);

    // Números de página
    let startP = Math.max(1, state.currentPage - 2);
    let endP = Math.min(totalPages, startP + 4);
    if (endP - startP < 4) startP = Math.max(1, endP - 4);

    for (let p = startP; p <= endP; p++) {
      const btnP = document.createElement('button');
      btnP.className = `page-btn ${p === state.currentPage ? 'active' : ''}`;
      btnP.textContent = p;
      btnP.addEventListener('click', () => {
        state.currentPage = p;
        renderTable();
      });
      paginationControls.appendChild(btnP);
    }

    // Botón Siguiente
    const btnNext = document.createElement('button');
    btnNext.className = 'page-btn';
    btnNext.textContent = 'Siguiente »';
    btnNext.disabled = state.currentPage === totalPages;
    btnNext.addEventListener('click', () => {
      if (state.currentPage < totalPages) {
        state.currentPage++;
        renderTable();
      }
    });
    paginationControls.appendChild(btnNext);
  }

  // ==========================================
  // 7. Visibilidad de Columnas
  // ==========================================
  btnToggleColumns.addEventListener('click', (e) => {
    e.stopPropagation();
    columnsDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!columnsDropdown.contains(e.target) && e.target !== btnToggleColumns) {
      columnsDropdown.classList.add('hidden');
    }
  });

  columnsDropdown.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const colClass = e.target.getAttribute('data-col');
      state.visibleColumns[colClass] = e.target.checked;
      applyColumnVisibility();
    });
  });

  function applyColumnVisibility() {
    Object.keys(state.visibleColumns).forEach(colClass => {
      const isVisible = state.visibleColumns[colClass];
      const elements = document.querySelectorAll(`.${colClass}`);
      elements.forEach(el => {
        if (isVisible) el.classList.remove('hidden');
        else el.classList.add('hidden');
      });
    });
  }

  // ==========================================
  // 8. Exportación Multiformato (Excel, PDF, CSV)
  // ==========================================
  if (btnExportToggle) {
    btnExportToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdown.classList.toggle('hidden');
    });
  }

  document.addEventListener('click', (e) => {
    if (exportDropdown && !exportDropdown.contains(e.target) && e.target !== btnExportToggle) {
      exportDropdown.classList.add('hidden');
    }
  });

  function escapeXml(unsafe) {
    return String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Exportar Excel (.xls)
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', () => {
      exportDropdown.classList.add('hidden');
      if (state.workers.length === 0) {
        alert('Primero cargue un archivo de trabajadores.');
        return;
      }

      const headers = ['#', 'DNI', 'Apellidos y Nombres', 'Fec. Nacimiento', 'Régimen SIGA', 'Fuente SBS', 'Fuente AFPNET', 'Fuente ONP', 'CUSPP', 'Estado Semáforo'];
      const xmlRows = state.workers.map(w => {
        const sbs = w.sbs_resultado ? (w.sbs_resultado.afp || w.sbs_resultado.estado_sbs) : 'Sin consultar';
        const afpnet = w.afpnet_resultado ? (w.afpnet_resultado.afp || '-') : 'Sin consultar';
        const onp = w.onp_resultado ? (w.onp_resultado.estado || '-') : '-';
        return `
          <Row>
            <Cell><Data ss:Type="Number">${w.index}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(w.dni)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(w.nombre_completo)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(w.fecha_nacimiento || '')}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(w.previsiona_siga || '')}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(sbs)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(afpnet)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(onp)}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(w.cuspp_siga || '')}</Data></Cell>
            <Cell><Data ss:Type="String">${escapeXml(w.semaforo_texto || '')}</Data></Cell>
          </Row>
        `;
      }).join('');

      const xmlTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF" ss:FontName="Calibri" ss:Size="11"/>
   <Interior ss:Color="#0B2F64" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4AF37"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Verificacion_Previsional">
  <Table>
   <Column ss:Width="40"/>
   <Column ss:Width="80"/>
   <Column ss:Width="220"/>
   <Column ss:Width="90"/>
   <Column ss:Width="110"/>
   <Column ss:Width="110"/>
   <Column ss:Width="110"/>
   <Column ss:Width="80"/>
   <Column ss:Width="100"/>
   <Column ss:Width="140"/>
   <Row ss:StyleID="Header">
    ${headers.map(h => `<Cell><Data ss:Type="String">${h}</Data></Cell>`).join('')}
   </Row>
   ${xmlRows}
  </Table>
 </Worksheet>
</Workbook>`;

      const blob = new Blob([xmlTemplate], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Verificacion_Previsional_MPFN_${new Date().toISOString().slice(0, 10)}.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Exportar PDF institucional
  if (btnExportPDF) {
    btnExportPDF.addEventListener('click', () => {
      exportDropdown.classList.add('hidden');
      if (state.workers.length === 0) {
        alert('Primero cargue un archivo de trabajadores.');
        return;
      }

      const printWindow = window.open('', '_blank');
      const rowsHtml = state.workers.map(w => {
        const sbs = w.sbs_resultado ? (w.sbs_resultado.afp || w.sbs_resultado.estado_sbs) : '-';
        const afpnet = w.afpnet_resultado ? (w.afpnet_resultado.afp || '-') : '-';
        return `
          <tr>
            <td style="text-align:center;">${w.index}</td>
            <td><strong>${w.dni}</strong></td>
            <td>${w.nombre_completo}</td>
            <td>${w.previsiona_siga || '-'}</td>
            <td>${sbs}</td>
            <td>${afpnet}</td>
            <td><code>${w.cuspp_siga || '-'}</code></td>
            <td>${w.semaforo_texto}</td>
          </tr>
        `;
      }).join('');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Reporte de Verificación Previsional - MPFN</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 24px; color: #1E293B; font-size: 11px; }
            .header { border-bottom: 2px solid #D4AF37; padding-bottom: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 15px; font-weight: bold; color: #0B2F64; margin: 0; }
            .subtitle { font-size: 11px; color: #64748B; margin-top: 2px; }
            .meta { font-size: 10px; color: #475569; text-align: right; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #0B2F64; color: white; padding: 6px 8px; font-size: 10px; text-align: left; }
            td { border-bottom: 1px solid #E2E8F0; padding: 5px 8px; font-size: 10px; }
            tr:nth-child(even) { background-color: #F8FAFC; }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">MINISTERIO PÚBLICO - FISCALÍA DE LA NACIÓN</div>
              <div class="subtitle">Reporte de Verificación y Acreditación Previsional (SPP / SNP)</div>
            </div>
            <div class="meta">
              <div>Fecha: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
              <div>Total: ${state.workers.length} trabajadores</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>DNI</th>
                <th>Trabajador</th>
                <th>Régimen SIGA</th>
                <th>SBS (SPP)</th>
                <th>AFPNET</th>
                <th>CUSPP</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    });
  }

  // Exportar CSV
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => {
      exportDropdown.classList.add('hidden');
      if (state.workers.length === 0) {
        alert('Primero cargue un archivo de trabajadores.');
        return;
      }

      const headers = ['#', 'DNI', 'Apellidos y Nombres', 'Fecha Nacimiento', 'Regimen SIGA', 'Fuente SBS', 'Fuente AFPNET', 'Fuente ONP', 'CUSPP', 'Estado Semáforo'];
      const rows = state.workers.map(w => [
        w.index,
        `"${w.dni}"`,
        `"${w.nombre_completo}"`,
        `"${w.fecha_nacimiento || ''}"`,
        `"${w.previsiona_siga || ''}"`,
        `"${w.sbs_resultado ? (w.sbs_resultado.afp || w.sbs_resultado.estado_sbs) : 'Pendiente'}"`,
        `"${w.afpnet_resultado ? (w.afpnet_resultado.afp || '') : 'Pendiente'}"`,
        `"${w.onp_resultado ? (w.onp_resultado.estado || '') : 'Pendiente'}"`,
        `"${w.cuspp_siga || ''}"`,
        `"${w.semaforo_texto || ''}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Verificacion_Previsional_MPFN_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  // ==========================================
  // 9. Motor de Verificación SBS y Cronómetro
  // ==========================================
  let isVerifying = false;
  let cancelVerification = false;
  let timerInterval = null;
  let timerSeconds = 0;

  const verificationProgressBar = document.getElementById('verificationProgressBar');
  const progressLabel = document.getElementById('progressLabel');
  const progressCount = document.getElementById('progressCount');
  const progressFill = document.getElementById('progressFill');
  const verificationTimer = document.getElementById('verificationTimer');

  function startTimer() {
    clearInterval(timerInterval);
    timerSeconds = 0;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      timerSeconds++;
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function updateTimerDisplay() {
    if (!verificationTimer) return;
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    verificationTimer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Configuración de Consulta SBS (Modal Simplificado para Usuario Administrativo)
  function initScrapingConfig() {
    const cfgVisibleBrowser = document.getElementById('cfgVisibleBrowser');

    fetch('/api/sbs/config')
      .then(r => r.json())
      .then(d => {
        if (d.concurrency) {
          state.scrapingConfig.concurrency = d.concurrency;
          const r = document.querySelector(`input[name="speedRadio"][value="${d.concurrency}"]`);
          if (r) r.checked = true;
        }
        if (d.headless !== undefined) {
          state.scrapingConfig.headless = d.headless;
          if (cfgVisibleBrowser) cfgVisibleBrowser.checked = !d.headless;
        }
      })
      .catch(() => {});

    if (btnScrapingConfig) {
      btnScrapingConfig.addEventListener('click', () => {
        configModalBackdrop.classList.remove('hidden');
      });
    }

    const closeCfg = () => configModalBackdrop.classList.add('hidden');
    if (btnCloseConfigModal) btnCloseConfigModal.addEventListener('click', closeCfg);
    if (btnCancelConfig) btnCancelConfig.addEventListener('click', closeCfg);

    if (btnSaveConfig) {
      btnSaveConfig.addEventListener('click', async () => {
        const selectedRadio = document.querySelector('input[name="speedRadio"]:checked');
        const conc = selectedRadio ? parseInt(selectedRadio.value) : 1;
        const isVisible = cfgVisibleBrowser ? cfgVisibleBrowser.checked : true;
        const headless = !isVisible;

        state.scrapingConfig.concurrency = conc;
        state.scrapingConfig.headless = headless;
        state.scrapingConfig.delayMs = conc === 2 ? 800 : 1200;

        try {
          await fetch('/api/sbs/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ concurrency: conc, headless: headless })
          });
        } catch (e) {
          console.warn('Error al guardar configuración en servidor:', e);
        }

        closeCfg();
      });
    }
  }
  initScrapingConfig();

  btnStartVerify.addEventListener('click', async () => {
    if (state.workers.length === 0) {
      alert('Cargue primero el reporte del SIGA antes de iniciar la verificación.');
      return;
    }

    if (!state.activeSources.sbs && !state.activeSources.afpnet) {
      alert('Seleccione al menos una fuente de verificación (SBS o AFPNET).');
      return;
    }

    if (isVerifying) {
      if (confirm('¿Desea detener la verificación y cerrar las ventanas de consulta?')) {
        cancelVerification = true;
        btnStartVerify.disabled = true;
        btnStartVerify.textContent = 'Cerrando ventanas...';
        stopTimer();
        // Cierre inmediato de ventanas en Playwright
        fetch('/api/sbs/stop', { method: 'POST' }).catch(() => {});
      }
      return;
    }

    if (state.activeSources.sbs) {
      await runSBSVerification();
    }
  });

  async function runSBSVerification() {
    isVerifying = true;
    cancelVerification = false;
    startTimer();

    btnStartVerify.classList.remove('btn-institutional');
    btnStartVerify.classList.add('btn-outline-danger');
    btnStartVerify.innerHTML = `
      <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"></circle>
      </svg>
      Detener verificación
    `;

    verificationProgressBar.classList.remove('hidden');
    progressLabel.textContent = `Iniciando consulta paralela (${state.scrapingConfig.concurrency} ventana/s)...`;

    const workersToProcess = state.workers.filter(w => !w.sbs_resultado || w.sbs_resultado.estado_sbs !== 'ENCONTRADO');
    const total = state.workers.length;
    let completed = total - workersToProcess.length;
    updateProgressBar(completed, total, 'Iniciando...');

    let queueIndex = 0;
    const concurrency = Math.min(state.scrapingConfig.concurrency, workersToProcess.length || 1);

    async function workerTask(workerNum) {
      while (queueIndex < workersToProcess.length && !cancelVerification) {
        const currentWorkerIdx = queueIndex++;
        const w = workersToProcess[currentWorkerIdx];
        if (!w) break;

        updateProgressBar(completed, total, `[Ventana ${workerNum + 1}] Consultando: ${w.nombre_completo} (${w.dni})`);

        try {
          const response = await fetch('/api/sbs/verify-worker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dni: w.dni,
              ape_paterno: w.ape_paterno,
              ape_materno: w.ape_materno,
              primer_nombre: w.primer_nombre,
              segundo_nombre: w.segundo_nombre
            })
          });

          const sbsRes = await response.json();
          w.sbs_resultado = sbsRes;
          evaluateWorkerSemaforo(w);
        } catch (err) {
          console.error(`Error al verificar DNI ${w.dni}:`, err);
          w.sbs_resultado = {
            afiliado_spp: null,
            afp: 'ERROR RED',
            estado_sbs: 'ERROR',
            mensaje: err.message
          };
        }

        completed++;
        updateProgressBar(completed, total, `[Ventana ${workerNum + 1}] Finalizado: ${w.nombre_completo}`);
        updateMetrics();
        renderTable();

        if (!cancelVerification && state.scrapingConfig.delayMs > 0) {
          await new Promise(r => setTimeout(r, state.scrapingConfig.delayMs));
        }
      }
    }

    const workerPromises = [];
    for (let i = 0; i < concurrency; i++) {
      workerPromises.push(workerTask(i));
    }
    await Promise.all(workerPromises);

    stopTimer();
    isVerifying = false;
    btnStartVerify.disabled = false;
    btnStartVerify.classList.remove('btn-outline-danger');
    btnStartVerify.classList.add('btn-institutional');
    btnStartVerify.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      ${cancelVerification ? 'Reanudar verificación SBS' : 'Verificación SBS completada'}
    `;

    if (!cancelVerification) {
      progressLabel.textContent = `¡Verificación con la SBS completada con éxito! (Tiempo: ${verificationTimer ? verificationTimer.textContent : ''})`;
      fetch('/api/sbs/stop', { method: 'POST' }).catch(() => {});
    } else {
      progressLabel.textContent = `Verificación pausada en el trabajador ${completed} de ${total}.`;
    }
  }

  function updateProgressBar(completed, total, currentText) {
    const percent = Math.round((completed / total) * 100);
    progressFill.style.width = `${percent}%`;
    progressCount.textContent = `${completed} / ${total} (${percent}%)`;
    if (currentText) {
      progressLabel.textContent = currentText;
    }
  }

  function evaluateWorkerSemaforo(w) {
    const siga = (w.previsiona_siga || '').toUpperCase();
    const sbs = w.sbs_resultado;
    const afpnet = w.afpnet_resultado;

    // 1. Errores y latencias en SBS
    if (sbs && sbs.afp === 'VENTANA CERRADA') {
      w.semaforo = 'error';
      w.semaforo_texto = 'Ventana cerrada (reintentar)';
      return;
    }

    if (sbs && sbs.estado_sbs === 'ERROR') {
      w.semaforo = 'error';
      w.semaforo_texto = 'Error en SBS (reintentar)';
      return;
    }

    if (sbs && sbs.estado_sbs === 'TIMEOUT') {
      w.semaforo = 'latencia';
      w.semaforo_texto = 'Tiempo agotado (reintentar)';
      return;
    }

    // 2. Comprobar afiliación en fuentes oficiales (AFPNET o SBS)
    let afpCertificada = null;
    let origenCertificado = null;

    if (afpnet && afpnet.afiliado_spp) {
      afpCertificada = (afpnet.afp || '').toUpperCase();
      origenCertificado = 'AFPNET';
      if (afpnet.cuspp && afpnet.cuspp !== '-') {
        w.cuspp_siga = afpnet.cuspp;
      }
    } else if (sbs && sbs.afiliado_spp) {
      afpCertificada = (sbs.afp || '').toUpperCase();
      origenCertificado = 'SBS';
      if (sbs.cuspp && sbs.cuspp !== '-') {
        w.cuspp_siga = sbs.cuspp;
      }
    }

    if (afpCertificada) {
      // Afiliado certificado en el SPP
      if (siga.includes(afpCertificada)) {
        w.semaforo = 'coincidente';
        w.semaforo_texto = `Coincide (${afpCertificada})`;
      } else if (siga.includes('ONP') || siga.includes('SNP') || siga.includes('19990')) {
        // En SIGA dice ONP pero en AFPNET/SBS está en AFP -> Discrepancia
        w.semaforo = 'discrepancia';
        w.semaforo_texto = `Alerta: en ${origenCertificado} es ${afpCertificada} (SIGA: ONP)`;
      } else {
        // En SIGA dice otra AFP distinta
        w.semaforo = 'discrepancia';
        w.semaforo_texto = `Cambio de AFP: ${afpCertificada} (SIGA: ${siga})`;
      }
      return;
    }

    // 3. No figura en SPP (SBS o AFPNET)
    if ((sbs && !sbs.afiliado_spp) || (afpnet && !afpnet.afiliado_spp)) {
      if (siga.includes('ONP') || siga.includes('SNP') || siga.includes('19990')) {
        w.semaforo = 'sin_afiliacion';
        w.semaforo_texto = 'No registrado en AFP (posible ONP)';
      } else if (!siga || siga.includes('SIN')) {
        w.semaforo = 'sin_afiliacion';
        w.semaforo_texto = 'Sin afiliación previa';
      } else {
        w.semaforo = 'discrepancia';
        w.semaforo_texto = `No figura en SPP (SIGA: ${siga})`;
      }
      return;
    }

    // 4. Si aún no fue verificado
    w.semaforo = 'pendiente';
    w.semaforo_texto = 'Por verificar';
  }

  // ==========================================
  // 10. Modal de Ficha Previsional Detallada
  // ==========================================
  const workerModalBackdrop = document.getElementById('workerModalBackdrop');
  const btnModalClose = document.getElementById('btnModalClose');
  const btnModalCloseFooter = document.getElementById('btnModalCloseFooter');
  const btnModalReverifySBS = document.getElementById('btnModalReverifySBS');

  const modalAvatarInitials = document.getElementById('modalAvatarInitials');
  const modalWorkerName = document.getElementById('modalWorkerName');
  const modalWorkerDni = document.getElementById('modalWorkerDni');
  const modalWorkerNacim = document.getElementById('modalWorkerNacim');
  const modalWorkerCargo = document.getElementById('modalWorkerCargo');
  const modalWorkerRegimen = document.getElementById('modalWorkerRegimen');
  const modalWorkerMonto = document.getElementById('modalWorkerMonto');

  const modalSigaRegimen = document.getElementById('modalSigaRegimen');
  const modalSigaCuspp = document.getElementById('modalSigaCuspp');
  const modalSigaAfil = document.getElementById('modalSigaAfil');

  const modalSbsAfp = document.getElementById('modalSbsAfp');
  const modalSbsCuspp = document.getElementById('modalSbsCuspp');
  const modalSbsFecha = document.getElementById('modalSbsFecha');
  const modalSbsSituacion = document.getElementById('modalSbsSituacion');

  const modalVerdictBox = document.getElementById('modalVerdictBox');
  const modalVerdictIcon = document.getElementById('modalVerdictIcon');
  const modalVerdictTitle = document.getElementById('modalVerdictTitle');
  const modalVerdictDesc = document.getElementById('modalVerdictDesc');

  let currentModalWorker = null;

  function openWorkerModal(worker) {
    currentModalWorker = worker;

    // Iniciales para el avatar
    const parts = (worker.nombre_completo || '').split(' ');
    const initials = parts.slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || 'TR';
    modalAvatarInitials.textContent = initials;

    // Datos generales
    modalWorkerName.textContent = worker.nombre_completo;
    modalWorkerDni.textContent = worker.dni;
    modalWorkerNacim.textContent = worker.fecha_nacimiento || 'No registrada';
    modalWorkerCargo.textContent = worker.cargo || 'Personal CAS';
    modalWorkerRegimen.textContent = worker.regimen_laboral || 'D.L. 1057 (CAS)';
    modalWorkerMonto.textContent = worker.monto_mensual ? `S/ ${parseFloat(worker.monto_mensual).toFixed(2)}` : 'S/ 0.00';

    // Fuente 1: SIGA
    modalSigaRegimen.textContent = worker.previsiona_siga || 'SIN REGISTRO';
    modalSigaCuspp.textContent = worker.cuspp_siga || '-';
    modalSigaAfil.textContent = worker.afiliacion_siga || '-';

    // Fuente 2: SBS
    const sbs = worker.sbs_resultado;
    if (sbs) {
      if (sbs.estado_sbs === 'ENCONTRADO') {
        modalSbsAfp.textContent = sbs.afp;
        modalSbsCuspp.textContent = sbs.cuspp || '-';
        modalSbsFecha.textContent = sbs.fecha_afiliacion || '-';
        modalSbsSituacion.textContent = sbs.situacion || 'Afiliado';
      } else if (sbs.estado_sbs === 'NO REGISTRADO') {
        modalSbsAfp.textContent = 'No registrado en SPP';
        modalSbsCuspp.textContent = '-';
        modalSbsFecha.textContent = '-';
        modalSbsSituacion.textContent = 'No figura en el Sistema Privado (AFP)';
      } else if (sbs.afp === 'VENTANA CERRADA') {
        modalSbsAfp.textContent = 'Ventana cerrada';
        modalSbsCuspp.textContent = '-';
        modalSbsFecha.textContent = '-';
        modalSbsSituacion.textContent = 'La ventana de Chromium se cerró. Pulse "Reconsultar SBS" para reabrirla.';
      } else if (sbs.estado_sbs === 'TIMEOUT') {
        modalSbsAfp.textContent = 'Tiempo agotado (timeout)';
        modalSbsCuspp.textContent = '-';
        modalSbsFecha.textContent = '-';
        modalSbsSituacion.textContent = 'El portal SBS tardó más de 12 segundos en responder';
      } else {
        modalSbsAfp.textContent = 'Error de conexión';
        modalSbsCuspp.textContent = '-';
        modalSbsFecha.textContent = '-';
        modalSbsSituacion.textContent = sbs.mensaje || 'Error';
      }
    } else {
      modalSbsAfp.textContent = 'Sin consultar';
      modalSbsCuspp.textContent = '-';
      modalSbsFecha.textContent = '-';
      modalSbsSituacion.textContent = 'Aún no se ha realizado la verificación con la SBS';
    }

    // Fuente 3: AFPNET
    const afpnet = worker.afpnet_resultado;
    const modalAfpnetPrevisiona = document.getElementById('modalAfpnetPrevisiona');
    const modalAfpnetCuspp = document.getElementById('modalAfpnetCuspp');
    const modalAfpnetComision = document.getElementById('modalAfpnetComision');
    const modalAfpnetDevengue = document.getElementById('modalAfpnetDevengue');

    if (afpnet) {
      modalAfpnetPrevisiona.textContent = afpnet.afp || 'No registrado';
      if (modalAfpnetCuspp) modalAfpnetCuspp.textContent = afpnet.cuspp || '-';
      modalAfpnetComision.textContent = afpnet.tipo_comision && afpnet.tipo_comision !== '-' ?
        `${afpnet.tipo_comision} (${afpnet.pct_comision || '0'}%)` : '-';
      modalAfpnetDevengue.textContent = afpnet.ultimo_devengue && afpnet.ultimo_devengue !== '-' ?
        `${afpnet.ultimo_devengue} (${afpnet.motivo_salida || 'Activo'})` : (afpnet.devengue_maximo || '-');
    } else {
      modalAfpnetPrevisiona.textContent = 'Sin consultar';
      if (modalAfpnetCuspp) modalAfpnetCuspp.textContent = '--';
      modalAfpnetComision.textContent = '--';
      modalAfpnetDevengue.textContent = '--';
    }

    // Dictamen y Recomendación de Pago
    updateModalVerdict(worker);

    // Mostrar modal
    workerModalBackdrop.classList.remove('hidden');
  }

  function updateModalVerdict(worker) {
    modalVerdictBox.className = 'verdict-box';
    const sbs = worker.sbs_resultado;
    const siga = (worker.previsiona_siga || '').toUpperCase();

    if (!sbs) {
      modalVerdictBox.classList.add('verdict-naranja');
      modalVerdictIcon.textContent = '•';
      modalVerdictTitle.textContent = 'Consulta pendiente de ejecución';
      modalVerdictDesc.textContent = 'Pulse el botón "Reconsultar SBS" para validar la afiliación de este trabajador.';
      return;
    }

    if (sbs.afp === 'VENTANA CERRADA') {
      modalVerdictBox.classList.add('verdict-naranja');
      modalVerdictIcon.textContent = '•';
      modalVerdictTitle.textContent = 'Ventana del navegador cerrada';
      modalVerdictDesc.textContent = 'La ventana de navegación fue cerrada. Al pulsar "Reconsultar SBS" el sistema la reabrirá automáticamente para consultar los datos.';
      return;
    }

    if (worker.semaforo === 'coincidente') {
      modalVerdictBox.classList.add('verdict-verde');
      modalVerdictIcon.textContent = '✓';
      modalVerdictTitle.textContent = `Acreditación conforme: afiliado a ${sbs.afp}`;
      modalVerdictDesc.textContent = `Los registros del SIGA y la Superintendencia (SBS) coinciden plenamente. Se autoriza la retención y abono legal correspondiente a ${sbs.afp} bajo el CUSPP ${sbs.cuspp}.`;
    } else if (worker.semaforo === 'discrepancia') {
      modalVerdictBox.classList.add('verdict-rojo');
      modalVerdictIcon.textContent = '!';
      modalVerdictTitle.textContent = 'Discrepancia previsional detectada';
      if (siga.includes('ONP') && sbs.afiliado_spp) {
        modalVerdictDesc.textContent = `Alerta de retención: En el SIGA figura registrado como SNP (ONP), pero la SBS certifica formalmente afiliación a ${sbs.afp}. Acción requerida: Corregir en SIGA y abonar a ${sbs.afp} para evitar contingencias legales o multas.`;
      } else {
        modalVerdictDesc.textContent = `El SIGA registra '${worker.previsiona_siga}', pero la SBS certifica '${sbs.afp}'. Acción requerida: Ajustar el registro en el sistema de planillas del MPFN previo al devengue mensual.`;
      }
    } else if (worker.semaforo === 'latencia' || worker.semaforo === 'error') {
      modalVerdictBox.classList.add('verdict-naranja');
      modalVerdictIcon.textContent = '!';
      modalVerdictTitle.textContent = 'Tiempo de respuesta agotado en la SBS';
      modalVerdictDesc.textContent = 'El portal de la SBS demoró en responder. Utilice el botón "Reconsultar SBS" a continuación para reintentar.';
    } else {
      // sin_afiliacion
      modalVerdictBox.classList.add('verdict-azul');
      modalVerdictIcon.textContent = 'i';
      modalVerdictTitle.textContent = 'Trabajador no registrado en AFP (posible ONP o nuevo ingreso)';
      modalVerdictDesc.textContent = 'La SBS certifica que este trabajador no figura en el Sistema Privado (SPP). Verifique con AFPNET o proceda a su primera afiliación institucional.';
    }
  }

  // Cerrar modal
  function closeModal() {
    workerModalBackdrop.classList.add('hidden');
    currentModalWorker = null;
  }

  btnModalClose.addEventListener('click', closeModal);
  btnModalCloseFooter.addEventListener('click', closeModal);
  workerModalBackdrop.addEventListener('click', (e) => {
    if (e.target === workerModalBackdrop) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !workerModalBackdrop.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Re-consultar desde el modal
  btnModalReverifySBS.addEventListener('click', async () => {
    if (!currentModalWorker) return;

    btnModalReverifySBS.disabled = true;
    btnModalReverifySBS.innerHTML = `
      <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"></circle>
      </svg>
      Consultando SBS...
    `;

    try {
      const response = await fetch('/api/sbs/verify-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dni: currentModalWorker.dni,
          ape_paterno: currentModalWorker.ape_paterno,
          ape_materno: currentModalWorker.ape_materno,
          primer_nombre: currentModalWorker.primer_nombre,
          segundo_nombre: currentModalWorker.segundo_nombre
        })
      });

      const sbsRes = await response.json();
      currentModalWorker.sbs_resultado = sbsRes;
      evaluateWorkerSemaforo(currentModalWorker);
      updateMetrics();
      renderTable();

      // Refrescar modal
      openWorkerModal(currentModalWorker);

    } catch (err) {
      alert('Error en consulta SBS: ' + err.message);
    } finally {
      btnModalReverifySBS.disabled = false;
      btnModalReverifySBS.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
        Re-consultar SBS en Vivo
      `;
    }
  });

  // Manejador de clics en la tabla
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-inspect-worker');
    if (!btn) return;

    const dni = btn.getAttribute('data-dni');
    const worker = state.workers.find(w => w.dni === dni);
    if (!worker) return;

    // Si el botón es para reintentar (por latencia o error), reintenta directo
    if (worker.semaforo === 'latencia' || worker.semaforo === 'error') {
      btn.disabled = true;
      btn.innerHTML = `<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"></circle></svg>`;
      try {
        const response = await fetch('/api/sbs/verify-worker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dni: worker.dni,
            ape_paterno: worker.ape_paterno,
            ape_materno: worker.ape_materno,
            primer_nombre: worker.primer_nombre,
            segundo_nombre: worker.segundo_nombre
          })
        });
        const sbsRes = await response.json();
        worker.sbs_resultado = sbsRes;
        evaluateWorkerSemaforo(worker);
        updateMetrics();
        renderTable();
      } catch (err) {
        alert('Error al reintentar: ' + err.message);
      }
      return;
    }

    // Si es "Ver Detalle", abre la Ficha Previsional Modal
    openWorkerModal(worker);
  });

  // ==========================================
  // 11. Modal de Gestión y Carga Masiva AFPNET (Fase 3)
  // ==========================================
  const afpnetModalBackdrop = document.getElementById('afpnetModalBackdrop');
  const btnAfpnetModalOpen = document.getElementById('btnAfpnetModalOpen');
  const btnAfpnetModalClose = document.getElementById('btnAfpnetModalClose');
  const btnAfpnetModalCloseFooter = document.getElementById('btnAfpnetModalCloseFooter');

  const btnLoadAfpnetSampleResult = document.getElementById('btnLoadAfpnetSampleResult');
  const dropZoneAfpnetResult = document.getElementById('dropZoneAfpnetResult');
  const afpnetFileInput = document.getElementById('afpnetFileInput');
  const afpnetResultStatus = document.getElementById('afpnetResultStatus');

  const btnAfpnetOpenBrowser = document.getElementById('btnAfpnetOpenBrowser');
  const afpnetCaptchaInput = document.getElementById('afpnetCaptchaInput');
  const btnAfpnetSubmitLogin = document.getElementById('btnAfpnetSubmitLogin');

  // Abrir y Cerrar Modal AFPNET
  if (btnAfpnetModalOpen) {
    btnAfpnetModalOpen.addEventListener('click', () => {
      if (afpnetModalBackdrop) afpnetModalBackdrop.classList.remove('hidden');
    });
  }

  function closeAfpnetModal() {
    if (afpnetModalBackdrop) afpnetModalBackdrop.classList.add('hidden');
  }

  if (btnAfpnetModalClose) btnAfpnetModalClose.addEventListener('click', closeAfpnetModal);
  if (btnAfpnetModalCloseFooter) btnAfpnetModalCloseFooter.addEventListener('click', closeAfpnetModal);
  if (afpnetModalBackdrop) {
    afpnetModalBackdrop.addEventListener('click', (e) => {
      if (e.target === afpnetModalBackdrop) closeAfpnetModal();
    });
  }

  // Pestañas de AFPNET
  document.querySelectorAll('.afpnet-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.afpnet-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.afpnet-tab-content').forEach(c => c.classList.add('hidden'));

      tabBtn.classList.add('active');
      const targetId = tabBtn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.remove('hidden');
    });
  });

  // Función para procesar y cruzar los resultados de AFPNET con la lista de trabajadores
  function mergeAfpnetResults(afpnetDataMap) {
    let matched = 0;
    state.workers.forEach(w => {
      if (afpnetDataMap[w.dni]) {
        w.afpnet_resultado = afpnetDataMap[w.dni];
        evaluateWorkerSemaforo(w);
        matched++;
      }
    });

    updateMetrics();
    renderTable();
    return matched;
  }

  // Cargar Resultado Oficial de Prueba (res_prueba_1_consultaCUSPPMasiva.xlsx)
  if (btnLoadAfpnetSampleResult) {
    btnLoadAfpnetSampleResult.addEventListener('click', async () => {
      btnLoadAfpnetSampleResult.disabled = true;
      btnLoadAfpnetSampleResult.textContent = 'Cargando y cruzando nómina con AFPNET...';
      try {
        const response = await fetch('/api/afpnet/load-sample-result', { method: 'POST' });
        const res = await response.json();
        if (res.success && res.data) {
          const matched = mergeAfpnetResults(res.data);
          afpnetResultStatus.innerHTML = `<span style="color: #166534;">${matched} trabajadores cruzados y actualizados con éxito desde el archivo oficial de AFPNET.</span>`;
        } else {
          afpnetResultStatus.innerHTML = `<span style="color: #991B1B;">Error: ${res.error || 'No se pudo procesar el archivo.'}</span>`;
        }
      } catch (err) {
        afpnetResultStatus.innerHTML = `<span style="color: #991B1B;">Error de conexión: ${err.message}</span>`;
      } finally {
        btnLoadAfpnetSampleResult.disabled = false;
        btnLoadAfpnetSampleResult.textContent = 'Cargar archivo de prueba oficial (docs/archivos_pruebas/res_prueba_1_consultaCUSPPMasiva.xlsx)';
      }
    });
  }

  // Subir Archivo Manual por Drag & Drop
  if (dropZoneAfpnetResult && afpnetFileInput) {
    dropZoneAfpnetResult.addEventListener('click', () => afpnetFileInput.click());

    dropZoneAfpnetResult.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZoneAfpnetResult.style.borderColor = '#0B2F64';
      dropZoneAfpnetResult.style.background = '#EFF6FF';
    });

    dropZoneAfpnetResult.addEventListener('dragleave', () => {
      dropZoneAfpnetResult.style.borderColor = '#94A3B8';
      dropZoneAfpnetResult.style.background = '#F8FAFC';
    });

    dropZoneAfpnetResult.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZoneAfpnetResult.style.borderColor = '#94A3B8';
      dropZoneAfpnetResult.style.background = '#F8FAFC';
      if (e.dataTransfer.files.length > 0) {
        uploadAfpnetResultFile(e.dataTransfer.files[0]);
      }
    });

    afpnetFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        uploadAfpnetResultFile(e.target.files[0]);
      }
    });
  }

  async function uploadAfpnetResultFile(file) {
    afpnetResultStatus.innerHTML = `<span style="color: #0B2F64;">Procesando archivo ${file.name}...</span>`;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/afpnet/upload-result', {
        method: 'POST',
        body: formData
      });
      const res = await response.json();
      if (res.success && res.data) {
        const matched = mergeAfpnetResults(res.data);
        afpnetResultStatus.innerHTML = `<span style="color: #166534;">${matched} trabajadores cruzados con éxito desde ${file.name}.</span>`;
      } else {
        afpnetResultStatus.innerHTML = `<span style="color: #991B1B;">Error: ${res.error || 'Archivo inválido.'}</span>`;
      }
    } catch (err) {
      afpnetResultStatus.innerHTML = `<span style="color: #991B1B;">Error al subir: ${err.message}</span>`;
    }
  }

  // Automatización en Pantalla (Chromium)
  if (btnAfpnetOpenBrowser) {
    btnAfpnetOpenBrowser.addEventListener('click', async () => {
      btnAfpnetOpenBrowser.disabled = true;
      btnAfpnetOpenBrowser.textContent = 'Abriendo Chromium...';
      try {
        const res = await fetch('/api/afpnet/start-session', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('Ventana de Chromium abierta en pantalla con RUC 20131370301, Usuario EMP0052 y Contraseña pre-cargados. Ingrese el captcha para continuar.');
          if (afpnetCaptchaInput) afpnetCaptchaInput.focus();
        } else {
          alert('Error al abrir navegador: ' + (data.error || 'Desconocido'));
        }
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btnAfpnetOpenBrowser.disabled = false;
        btnAfpnetOpenBrowser.textContent = 'Abrir ventana con credenciales precargadas';
      }
    });
  }

  if (btnAfpnetSubmitLogin) {
    btnAfpnetSubmitLogin.addEventListener('click', async () => {
      const captcha = (afpnetCaptchaInput ? afpnetCaptchaInput.value : '').trim();
      if (!captcha) {
        alert('Por favor ingrese el texto del captcha.');
        return;
      }

      btnAfpnetSubmitLogin.disabled = true;
      btnAfpnetSubmitLogin.textContent = 'Iniciando sesión...';
      try {
        const res = await fetch('/api/afpnet/submit-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captcha })
        });
        const data = await res.json();
        if (data.logged_in) {
          alert('Sesión iniciada con éxito. Navegando a Consulta de Afiliados Masiva.');
        } else {
          alert(data.mensaje || 'Error al validar captcha o credenciales.');
        }
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btnAfpnetSubmitLogin.disabled = false;
        btnAfpnetSubmitLogin.textContent = 'Ingresar y navegar a consulta masiva';
      }
    });
  }

});
