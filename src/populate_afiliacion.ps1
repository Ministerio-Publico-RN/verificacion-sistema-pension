param (
    [Parameter(Mandatory=$true)][string]$TemplatePath,
    [Parameter(Mandatory=$true)][string]$DataJsonPath,
    [Parameter(Mandatory=$true)][string]$OutputPath
)

$sw = [System.Diagnostics.Stopwatch]::StartNew()

if (Test-Path $OutputPath) {
    Remove-Item $OutputPath -Force
}

$rawJson = [System.IO.File]::ReadAllText($DataJsonPath, [System.Text.Encoding]::UTF8)
$rows = $rawJson | ConvertFrom-Json

$rowCount = $rows.Count
if ($rowCount -eq 0) {
    Write-Error "No rows provided in JSON"
    exit 1
}

$colCount = 18
$matrix = New-Object 'object[,]' $rowCount, $colCount

for ($r = 0; $r -lt $rowCount; $r++) {
    $rowArr = $rows[$r]
    for ($c = 0; $c -lt $colCount; $c++) {
        $val = $rowArr[$c]
        if ($null -eq $val) { $val = "" }
        $matrix[$r, $c] = [string]$val
    }
}

$excel = $null
$wb = $null
$sheet = $null

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $false

    $wb = $excel.Workbooks.Open($TemplatePath)
    $sheet = $wb.Worksheets.Item('Excel')

    # Fila 1: Banner / Instrucción oficial
    # Fila 2: Cabecera de 18 columnas
    # Fila 3: Indicaciones de datos y formatos
    # Fila 4 en adelante: Registros de trabajadores
    $startCell = $sheet.Cells.Item(4, 1)
    $endCell = $sheet.Cells.Item(3 + $rowCount, $colCount)
    $range = $sheet.Range($startCell, $endCell)
    $range.NumberFormat = "@"
    $range.Value2 = $matrix

    # Guardar copia en formato oficial .xls (56 = xlExcel8 BIFF8)
    $wb.SaveCopyAs($OutputPath)
    $sw.Stop()
    Write-Host "SUCCESS: $rowCount rows written starting at row 4 in $($sw.ElapsedMilliseconds) ms"
}
catch {
    Write-Error $_.Exception.Message
    exit 2
}
finally {
    if ($wb) {
        $wb.Close($false)
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null
    }
    if ($sheet) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) | Out-Null
    }
    if ($excel) {
        $excel.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
