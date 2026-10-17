param(
    [ValidateRange(800, 3840)][int]$Width = 1280,
    [ValidateRange(480, 2160)][int]$Height = 720,
    [string[]]$States = @('grid', 'hud', 'wires', 'cidr', 'subnet', 'reactor', 'segmentation', 'blaster', 'repair', 'vlsm', 'adaptive-wires', 'adaptive-cidr', 'patch')
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$preview = Join-Path $projectRoot 'tests\fixtures\combined_gameplay_preview.html'
$outputDirectory = Join-Path $projectRoot 'docs\screenshots\combined'
$renderProfile = Join-Path $env:TEMP ('ip2live-combined-render-' + [System.IO.Path]::GetRandomFileName())
$edgeExecutable = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edgeExecutable)) { throw 'Microsoft Edge is required for the local renderer.' }
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $renderProfile -Force | Out-Null
$queries = @{ grid = ''; hud = '?state=hud'; dock = '?state=dock'; minimized = '?state=minimized'; minimizing = '?state=minimizing'; closing = '?state=closing'; wires = '?tool=0'; patch = '?tool=1'; cidr = '?tool=2'; subnet = '?tool=3'; reactor = '?tool=4'; segmentation = '?tool=5'; blaster = '?tool=6'; repair = '?tool=7'; vlsm = '?tool=8'; 'adaptive-wires' = '?tool=9'; 'adaptive-cidr' = '?tool=10'; multi = '?tool=2&multi=1' }
foreach ($state in $States) {
    if (-not $queries.ContainsKey($state)) { throw ('Unknown preview state: ' + $state) }
    $name = $state + '-' + $Width + 'x' + $Height
    $outputFile = Join-Path $outputDirectory ($name + '.png')
    $domFile = Join-Path $renderProfile ($name + '.html')
    $previewUri = ([System.Uri]$preview).AbsoluteUri + $queries[$state]
    $arguments = @('--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--dump-dom',
        '--allow-file-access-from-files', '--hide-scrollbars', ('--window-size=' + $Width + ',' + $Height), '--virtual-time-budget=2500',
        ('--user-data-dir="' + $renderProfile + '"'), ('--screenshot="' + $outputFile + '"'), ('"' + $previewUri + '"'))
    $process = Start-Process -FilePath $edgeExecutable -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $domFile -RedirectStandardError (Join-Path $renderProfile ($name + '.log'))
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $outputFile)) { throw ('Rendering failed: ' + $state) }
    $dom = Get-Content -LiteralPath $domFile -Raw
    if ($dom -notmatch 'data-preview-state="ready"' -or $dom -match 'data-preview-error=') { throw ('Preview error: ' + $dom) }
    Get-Item -LiteralPath $outputFile | Select-Object Name, Length
}
