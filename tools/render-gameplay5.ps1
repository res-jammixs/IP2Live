param(
    [string[]]$Phases = @('classify', 'default_prefix', 'borrow_bits', 'new_cidr', 'calculator', 'route', 'unlock'),
    [ValidateRange(800, 3840)][int]$Width = 1920,
    [ValidateRange(600, 2160)][int]$Height = 1080
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$preview = Join-Path $projectRoot 'tests\fixtures\gameplay5_segmentation_preview.html'
$outputDirectory = Join-Path $projectRoot 'docs\screenshots\gameplay5'
$renderProfile = Join-Path $env:TEMP ('ip2live-gameplay5-render-' + [System.IO.Path]::GetRandomFileName())
$edgeExecutable = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edgeExecutable)) { throw 'Microsoft Edge is required for the local renderer.' }
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $renderProfile -Force | Out-Null
foreach ($phase in $Phases) {
    if ($phase -notin @('classify', 'tutorial_classify', 'tutorial_prefix', 'tutorial_prefix_recall', 'tutorial_borrow', 'tutorial_check', 'class_typing', 'class_one_mistake', 'class_two_mistakes', 'class_virus_out', 'class_virus_in', 'class_unlock', 'default_prefix', 'borrow_bits', 'new_cidr', 'host_bits', 'host_capacity', 'calculator', 'route', 'unlock', 'overrun_popup', 'overrun_pixels', 'overrun_full')) { throw 'Unknown preview phase.' }
    $outputFile = Join-Path $outputDirectory ($phase + '.png')
    $previewUri = ([System.Uri]$preview).AbsoluteUri + '?capture=' + $phase
    $arguments = @('--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--dump-dom',
        '--allow-file-access-from-files', '--hide-scrollbars', ('--window-size=' + $Width + ',' + ($Height + 38)), '--virtual-time-budget=5000',
        ('--user-data-dir="' + $renderProfile + '"'), ('--screenshot="' + $outputFile + '"'), ('"' + $previewUri + '"'))
    $process = Start-Process -FilePath $edgeExecutable -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $renderProfile ($phase + '.html')) -RedirectStandardError (Join-Path $renderProfile ($phase + '.log'))
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $outputFile)) { throw ('Rendering failed: ' + $phase) }
    Get-Item -LiteralPath $outputFile | Select-Object Name, Length
}
