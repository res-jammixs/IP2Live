param(
    [ValidateSet('dark', 'gate', 'reveal', 'settled', 'idle')][string[]]$Phases = @('settled'),
    [ValidateRange(800, 3840)][int]$Width = 1920,
    [ValidateRange(600, 2160)][int]$Height = 1080
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$preview = Join-Path $projectRoot 'tests\fixtures\main_menu_preview.html'
$outputDirectory = Join-Path $projectRoot 'docs\screenshots\main-menu'
$renderProfile = Join-Path $env:TEMP ('ip2live-menu-render-' + [System.IO.Path]::GetRandomFileName())
$edgeExecutable = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edgeExecutable)) { throw 'Microsoft Edge is required for the local renderer.' }
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $renderProfile -Force | Out-Null
foreach ($phase in $Phases) {
    $prefix = if ($phase -eq 'settled') { '' } else { $phase + '-' }
    $outputFile = Join-Path $outputDirectory ($prefix + $Width.ToString() + 'x' + $Height + '.png')
    $domFile = Join-Path $renderProfile ($phase + '.html')
    $previewUri = ([System.Uri]$preview).AbsoluteUri + '?capture=' + $phase + '&width=' + $Width + '&height=' + $Height
    $arguments = @('--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--dump-dom',
        '--allow-file-access-from-files', '--hide-scrollbars', ('--window-size=' + $Width + ',' + $Height), '--virtual-time-budget=5000',
        ('--user-data-dir="' + $renderProfile + '"'), ('--screenshot="' + $outputFile + '"'), ('"' + $previewUri + '"'))
    $process = Start-Process -FilePath $edgeExecutable -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $domFile -RedirectStandardError (Join-Path $renderProfile ($phase + '.log'))
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $outputFile)) { throw 'Main-menu rendering failed.' }
    if ((Get-Content -LiteralPath $domFile -Raw) -notmatch 'data-preview-state="ready"') { throw ('Main-menu preview did not finish. See ' + $domFile) }
    Get-Item -LiteralPath $outputFile | Select-Object Name, Length
}
