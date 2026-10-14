param(
    [ValidateSet('complete', 'cutscene', 'apex', 'robots', 'restored', 'archive', 'empty', 'long', 'certificate', 'certificate-view')][string[]]$States = @('cutscene', 'apex', 'robots', 'restored', 'complete', 'certificate-view'),
    [ValidateRange(640, 3840)][int]$Width = 1920,
    [ValidateRange(480, 2160)][int]$Height = 1080
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$preview = Join-Path $projectRoot 'tests\fixtures\story_ending_preview.html'
$outputDirectory = Join-Path $projectRoot 'docs\screenshots\story-ending'
$renderProfile = Join-Path $env:TEMP ('ip2live-story-render-' + [System.IO.Path]::GetRandomFileName())
$edgeExecutable = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edgeExecutable)) { throw 'Microsoft Edge is required for the local renderer.' }
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $renderProfile -Force | Out-Null
foreach ($state in $States) {
    $renderWidth = $Width
    $renderHeight = $Height
    if ($state -eq 'certificate') { $renderWidth = 1684; $renderHeight = 1190 }
    $name = $state + '-' + $renderWidth + 'x' + $renderHeight
    $outputFile = Join-Path $outputDirectory ($name + '.png')
    $domFile = Join-Path $renderProfile ($name + '.html')
    $previewUri = ([System.Uri]$preview).AbsoluteUri + '?state=' + $state + '&w=' + $renderWidth + '&h=' + $renderHeight
    $arguments = @('--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--dump-dom',
        '--allow-file-access-from-files', '--hide-scrollbars', ('--window-size=' + $renderWidth + ',' + $renderHeight), '--virtual-time-budget=3000',
        ('--user-data-dir="' + $renderProfile + '"'), ('--screenshot="' + $outputFile + '"'), ('"' + $previewUri + '"'))
    $process = Start-Process -FilePath $edgeExecutable -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $domFile -RedirectStandardError (Join-Path $renderProfile ($name + '.log'))
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $outputFile)) { throw ('Story ending rendering failed. See ' + $renderProfile) }
    if ((Get-Content -LiteralPath $domFile -Raw) -notmatch 'data-preview-state="ready"') { throw ('Story ending preview did not finish. See ' + $domFile) }
    if ($state -eq 'certificate') {
        $markup = Get-Content -LiteralPath $domFile -Raw
        $pdfMatch = [regex]::Match($markup, 'id="certificate-pdf"[^>]*>([^<]+)</textarea>')
        if (-not $pdfMatch.Success) { throw 'Certificate PDF preview was not produced.' }
        [System.IO.File]::WriteAllBytes((Join-Path $outputDirectory 'certificate-example.pdf'), [System.Convert]::FromBase64String($pdfMatch.Groups[1].Value))
    }
    Get-Item -LiteralPath $outputFile | Select-Object Name, Length
}
