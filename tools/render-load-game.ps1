param(
    [ValidateSet('empty', 'saved', 'long', 'unavailable', 'back')][string[]]$States = @('empty', 'saved'),
    [ValidateRange(640, 3840)][int]$Width = 1920,
    [ValidateRange(480, 2160)][int]$Height = 1080,
    [int]$LogicalWidth = 1280,
    [int]$LogicalHeight = 720,
    [ValidateSet('load', 'save')][string]$Mode = 'load'
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$preview = Join-Path $projectRoot 'tests\fixtures\load_game_preview.html'
$outputDirectory = Join-Path $projectRoot 'docs\screenshots\load-game'
$renderProfile = Join-Path $env:TEMP ('ip2live-load-render-' + [System.IO.Path]::GetRandomFileName())
$edgeExecutable = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edgeExecutable)) { throw 'Microsoft Edge is required for the local renderer.' }
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $renderProfile -Force | Out-Null
foreach ($state in $States) {
    $name = $Mode + '-' + $state + '-' + $Width + 'x' + $Height
    $outputFile = Join-Path $outputDirectory ($name + '.png')
    $domFile = Join-Path $renderProfile ($name + '.html')
    $previewUri = ([System.Uri]$preview).AbsoluteUri + '?state=' + $state + '&width=' + $Width + '&height=' + $Height + '&sw=' + $LogicalWidth + '&sh=' + $LogicalHeight + '&mode=' + $Mode
    $arguments = @('--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--dump-dom',
        '--allow-file-access-from-files', '--hide-scrollbars', ('--window-size=' + $Width + ',' + $Height), '--virtual-time-budget=3000',
        ('--user-data-dir="' + $renderProfile + '"'), ('--screenshot="' + $outputFile + '"'), ('"' + $previewUri + '"'))
    $process = Start-Process -FilePath $edgeExecutable -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $domFile -RedirectStandardError (Join-Path $renderProfile ($name + '.log'))
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $outputFile)) { throw ('Load Game rendering failed. See ' + $renderProfile) }
    if ((Get-Content -LiteralPath $domFile -Raw) -notmatch 'data-preview-state="ready"') { throw ('Load Game preview did not finish. See ' + $domFile) }
    Get-Item -LiteralPath $outputFile | Select-Object Name, Length
}
