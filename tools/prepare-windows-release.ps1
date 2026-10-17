[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourceExportPath,

    [Parameter(Mandatory = $true)]
    [string]$DestinationPath,

    [string]$ProjectRoot,

    [ValidatePattern('^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$')]
    [string]$ReleaseVersion
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Resolve-ExistingDirectory {
    param([string]$LiteralPath, [string]$Label)
    $resolved = Resolve-Path -LiteralPath $LiteralPath -ErrorAction Stop
    $item = Get-Item -LiteralPath $resolved.Path -Force
    if (-not $item.PSIsContainer) {
        throw "$Label must be a directory: $($resolved.Path)"
    }
    return [IO.Path]::GetFullPath($resolved.Path).TrimEnd([IO.Path]::DirectorySeparatorChar)
}

function Assert-RequiredFile {
    param([string]$Root, [string]$RelativePath)
    $candidate = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "The RPG Paper Maker export is incomplete. Missing: $RelativePath"
    }
    return $candidate
}

function Get-RelativeChildPath {
    param([string]$RootWithSeparator, [string]$ChildPath)
    $fullChild = [IO.Path]::GetFullPath($ChildPath)
    if (-not $fullChild.StartsWith($RootWithSeparator, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to copy a path outside the validated export: $fullChild"
    }
    return $fullChild.Substring($RootWithSeparator.Length)
}

function Test-ExcludedReleasePath {
    param(
        [string]$RelativePath,
        [bool]$IsDirectory,
        [string[]]$AdditionalExcludedDirectories = @()
    )
    $normalized = $RelativePath.Replace('/', '\')
    if ($IsDirectory -and ([IO.Path]::GetFileName($normalized) -ieq '.git')) { return $true }
    if ($normalized -imatch '(^|\\)\.git(\\|$)') { return $true }
    if ($IsDirectory) {
        foreach ($excludedDirectory in $AdditionalExcludedDirectories) {
            $normalizedExcluded = $excludedDirectory.Replace('/', '\').TrimEnd('\')
            if ($normalized -ieq $normalizedExcluded) { return $true }
        }
    }
    if (-not $IsDirectory -and $normalized -imatch '^resources\\app\\build\\Saves\\\d+\.json$') { return $true }
    return $false
}

function Copy-ReleaseTree {
    param(
        [string]$Source,
        [string]$Destination,
        [string[]]$AdditionalExcludedDirectories = @()
    )
    New-Item -ItemType Directory -Path $Destination -ErrorAction Stop | Out-Null
    $rootPrefix = $Source + [IO.Path]::DirectorySeparatorChar
    $pending = New-Object 'System.Collections.Generic.Queue[string]'
    $pending.Enqueue($Source)

    while ($pending.Count -gt 0) {
        $current = $pending.Dequeue()
        foreach ($item in Get-ChildItem -LiteralPath $current -Force) {
            $relative = Get-RelativeChildPath -RootWithSeparator $rootPrefix -ChildPath $item.FullName
            $isDirectory = [bool]$item.PSIsContainer
            if (Test-ExcludedReleasePath -RelativePath $relative -IsDirectory $isDirectory -AdditionalExcludedDirectories $AdditionalExcludedDirectories) { continue }
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Reparse points are not permitted in release input: $($item.FullName)"
            }

            $target = Join-Path $Destination $relative
            if ($isDirectory) {
                New-Item -ItemType Directory -Path $target -ErrorAction Stop | Out-Null
                $pending.Enqueue($item.FullName)
            } else {
                $targetParent = Split-Path -Parent $target
                if (-not (Test-Path -LiteralPath $targetParent -PathType Container)) {
                    New-Item -ItemType Directory -Path $targetParent -ErrorAction Stop | Out-Null
                }
                Copy-Item -LiteralPath $item.FullName -Destination $target -Force -ErrorAction Stop
            }
        }
    }
}

function Get-CustomSongNames {
    param([string]$SongsPath)
    try {
        $songsDocument = [IO.File]::ReadAllText($SongsPath) | ConvertFrom-Json
    } catch {
        throw "The project songs.json is not valid JSON: $($_.Exception.Message)"
    }

    if (-not ($songsDocument.PSObject.Properties.Name -contains 'list')) {
        throw 'The project songs.json does not contain the expected RPG Paper Maker song list.'
    }

    $names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($category in @($songsDocument.list)) {
        if ($null -eq $category -or -not ($category.PSObject.Properties.Name -contains 'v')) { continue }
        foreach ($song in @($category.v)) {
            if ($null -eq $song) { continue }
            $properties = $song.PSObject.Properties.Name
            if (-not ($properties -contains 'name') -or -not ($properties -contains 'br')) { continue }
            $name = [string]$song.name
            if (-not [bool]$song.br -and $name -match '(?i)\.(?:mp3|wav|ogg|m4a|aac|flac)$') {
                $names.Add($name) | Out-Null
            }
        }
    }
    if ($names.Count -eq 0) {
        throw 'No custom song registrations were found in the project songs.json.'
    }
    return @($names | Sort-Object)
}

function Get-ExportedSongNames {
    param([string]$SongsPath)
    $content = [IO.File]::ReadAllText($SongsPath)
    $namePattern = New-Object Text.RegularExpressions.Regex(
        '"name"\s*:\s*"((?:\\.|[^"\\])*)"',
        ([Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::CultureInvariant)
    )
    $names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($songMatch in $namePattern.Matches($content)) {
        try {
            $name = ConvertFrom-Json -InputObject ('"' + $songMatch.Groups[1].Value + '"')
        } catch {
            throw "The exported build\songs.json contains an invalid song name: $($_.Exception.Message)"
        }
        if ([string]$name -match '(?i)\.(?:mp3|wav|ogg|m4a|aac|flac)$') {
            $names.Add([string]$name) | Out-Null
        }
    }
    return ,$names
}

function Get-BundledPrologueSongNames {
    param([string]$PluginRoot)
    $bundleRoot = Join-Path $PluginRoot 'assets\audio\story-prologue'
    $manifestPath = Join-Path $bundleRoot 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { return @() }
    $bundle = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
    if ($bundle.version -ne 1 -or @($bundle.entries).Count -ne 8) {
        throw 'The prologue audio bundle must contain all eight recovery assets.'
    }
    $allowedFiles = @('01-arrival', '02-taking', '03-fortress', '04-our-way-inside') | ForEach-Object {
        $_ + '-ost.wav'
        $_ + '-sfx.wav'
    }
    $names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($entry in $bundle.entries) {
        $file = [string]$entry.file
        if ($allowedFiles -cnotcontains $file -or $entry.name -cne ('StoryPrologue/' + $file)) {
            throw "Invalid prologue audio bundle entry: $file"
        }
        if (-not $names.Add([string]$entry.name)) { throw "Duplicate prologue audio bundle entry: $file" }
        $asset = Join-Path $bundleRoot $file
        if (-not (Test-Path -LiteralPath $asset -PathType Leaf)) { throw "Missing bundled prologue audio: $file" }
        if ((Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash -ine [string]$entry.sha256) {
            throw "Bundled prologue audio SHA256 mismatch: $file"
        }
    }
    return @($names | Sort-Object)
}

function Get-BundledGameplaySongNames {
    param([string]$PluginRoot)
    $bundleRoot = Join-Path $PluginRoot 'assets\audio\gameplay'
    $manifestPath = Join-Path $bundleRoot 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { return @() }
    $bundle = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
    $expected = @(
        '03-bitstream-decoder.wav', '04-subnet-relay.wav', '04_5-reactor-lattice.wav',
        '05-quarantine-breach.wav', '06-matrix-lockdown.wav',
        '07-repair-uplink.wav', '08-allocation-protocol.wav'
    )
    if ($bundle.version -ne 1 -or @($bundle.entries).Count -ne $expected.Count) {
        throw 'The gameplay audio bundle must contain all seven recovery assets.'
    }
    $names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($entry in $bundle.entries) {
        $file = [string]$entry.file
        $expectedId = 22 + [array]::IndexOf($expected, $file)
        if ($expected -cnotcontains $file -or $entry.name -cne ('Gameplay/' + $file) -or
            [int]$entry.kind -ne 1 -or [int]$entry.id -ne $expectedId) {
            throw "Invalid gameplay audio bundle entry: $file"
        }
        if (-not $names.Add([string]$entry.name)) { throw "Duplicate gameplay audio bundle entry: $file" }
        $asset = Join-Path $bundleRoot $file
        if (-not (Test-Path -LiteralPath $asset -PathType Leaf)) { throw "Missing bundled gameplay audio: $file" }
        if ((Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash -ine [string]$entry.sha256) {
            throw "Bundled gameplay audio SHA256 mismatch: $file"
        }
    }
    return @($names | Sort-Object)
}

function Get-BundledStoryEndingSongNames {
    param([string]$PluginRoot)
    $bundleRoot = Join-Path $PluginRoot 'assets\audio\story-ending'
    $manifestPath = Join-Path $bundleRoot 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { return @() }
    $bundle = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
    $expected = @('01-a-network-restored.wav', '02-open-skies.wav')
    if ($bundle.version -ne 1 -or @($bundle.entries).Count -ne $expected.Count) {
        throw 'The story ending audio bundle must contain both recovery assets.'
    }
    $names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($entry in $bundle.entries) {
        $file = [string]$entry.file
        $expectedId = 29 + [array]::IndexOf($expected, $file)
        if ($expected -cnotcontains $file -or $entry.name -cne ('StoryEnding/' + $file) -or
            [int]$entry.kind -ne 1 -or [int]$entry.id -ne $expectedId) {
            throw "Invalid story ending audio bundle entry: $file"
        }
        if (-not $names.Add([string]$entry.name)) { throw "Duplicate story ending audio bundle entry: $file" }
        $asset = Join-Path $bundleRoot $file
        if (-not (Test-Path -LiteralPath $asset -PathType Leaf)) { throw "Missing bundled story ending audio: $file" }
        if ((Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash -ine [string]$entry.sha256) {
            throw "Bundled story ending audio SHA256 mismatch: $file"
        }
    }
    return @($names | Sort-Object)
}

function Assert-CustomSongsRegistered {
    param(
        [string[]]$ExpectedNames,
        [string]$ExportedSongsPath,
        [string[]]$BundledSongNames = @()
    )
    $exportedNames = Get-ExportedSongNames -SongsPath $ExportedSongsPath
    $missing = @($ExpectedNames | Where-Object { -not $exportedNames.Contains($_) -and $BundledSongNames -cnotcontains $_ })
    if ($missing.Count -gt 0) {
        $missingList = $missing -join ', '
        throw "Exported build\songs.json is missing custom song registrations: $missingList. Re-export after registering songs in RPG Paper Maker; this release tool does not embed or convert audio files."
    }
}

function Assert-CopiedTreeMatches {
    param([string]$Source, [string]$Destination)
    $sourcePrefix = $Source + [IO.Path]::DirectorySeparatorChar
    $destinationPrefix = $Destination + [IO.Path]::DirectorySeparatorChar
    $sourceHashes = @{}
    foreach ($file in Get-ChildItem -LiteralPath $Source -File -Recurse -Force) {
        $relative = Get-RelativeChildPath -RootWithSeparator $sourcePrefix -ChildPath $file.FullName
        if (Test-ExcludedReleasePath -RelativePath $relative -IsDirectory $false) { continue }
        $sourceHashes[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    $destinationHashes = @{}
    foreach ($file in Get-ChildItem -LiteralPath $Destination -File -Recurse -Force) {
        $relative = Get-RelativeChildPath -RootWithSeparator $destinationPrefix -ChildPath $file.FullName
        if (Test-ExcludedReleasePath -RelativePath $relative -IsDirectory $false) { continue }
        $destinationHashes[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    if ($sourceHashes.Count -ne $destinationHashes.Count) {
        throw 'Project plugin verification failed: the release file count differs from the source plugin tree.'
    }
    foreach ($relative in $sourceHashes.Keys) {
        if (-not $destinationHashes.ContainsKey($relative) -or $sourceHashes[$relative] -ne $destinationHashes[$relative]) {
            throw "Project plugin verification failed after copying: $relative"
        }
    }
}

function Write-Utf8WithoutBom {
    param([string]$LiteralPath, [string]$Content)
    $encoding = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($LiteralPath, $Content, $encoding)
}

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$songMetadataRoot = $repositoryRoot
$syncProjectPlugin = $false
$projectPluginRoot = $null
if ($ProjectRoot) {
    $songMetadataRoot = Resolve-ExistingDirectory -LiteralPath $ProjectRoot -Label 'ProjectRoot'
    $projectPluginRoot = Join-Path $songMetadataRoot 'Plugins\IP2Live_Core'
    Assert-RequiredFile -Root $projectPluginRoot -RelativePath 'code.js' | Out-Null
    Assert-RequiredFile -Root $projectPluginRoot -RelativePath 'modules\desktop_storage.js' | Out-Null
    $syncProjectPlugin = $true
}
$projectSongsPath = Assert-RequiredFile -Root $songMetadataRoot -RelativePath 'songs.json'
$customSongNames = @(Get-CustomSongNames -SongsPath $projectSongsPath)

$sourceRoot = Resolve-ExistingDirectory -LiteralPath $SourceExportPath -Label 'SourceExportPath'
$destinationRoot = [IO.Path]::GetFullPath($DestinationPath).TrimEnd([IO.Path]::DirectorySeparatorChar)
if (Test-Path -LiteralPath $destinationRoot) {
    throw "DestinationPath must not already exist. The source export will not be modified: $destinationRoot"
}

$sourcePrefix = $sourceRoot + [IO.Path]::DirectorySeparatorChar
if ($destinationRoot.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'DestinationPath cannot be inside SourceExportPath.'
}

$required = @(
    'Game.exe',
    'resources\app\index.html',
    'resources\app\main.js',
    'resources\app\preload.js',
    'resources\app\package.json',
    'resources\app\build\songs.json',
    'resources\app\build\Scripts\Common\Platform.js',
    'resources\app\build\Plugins\IP2Live_Core\code.js'
)
if (-not $syncProjectPlugin) {
    $required += 'resources\app\build\Plugins\IP2Live_Core\modules\desktop_storage.js'
}
foreach ($relativePath in $required) {
    Assert-RequiredFile -Root $sourceRoot -RelativePath $relativePath | Out-Null
}

$sourceMainPath = Join-Path $sourceRoot 'resources\app\main.js'
$sourceMain = [IO.File]::ReadAllText($sourceMainPath)
$hasSingleQuotedLoad = $sourceMain.Contains("loadFile('index.html')")
$hasDoubleQuotedLoad = $sourceMain.Contains('loadFile("index.html")')
if (-not $hasSingleQuotedLoad -and -not $hasDoubleQuotedLoad) {
    throw 'The exported main.js does not match the expected RPG Paper Maker host structure.'
}
$sourcePlatform = [IO.File]::ReadAllText((Join-Path $sourceRoot 'resources\app\build\Scripts\Common\Platform.js'))
if ($sourcePlatform -notmatch 'window\.ipcRenderer\.send' -or $sourcePlatform -notmatch 'static async registerSave') {
    throw 'The exported RPG Paper Maker Platform.js is incompatible with this host patch.'
}
$pluginCodePath = if ($syncProjectPlugin) {
    Join-Path $projectPluginRoot 'code.js'
} else {
    Join-Path $sourceRoot 'resources\app\build\Plugins\IP2Live_Core\code.js'
}
$pluginCode = [IO.File]::ReadAllText($pluginCodePath)
if ($pluginCode -notmatch 'DesktopStorageReady' -or $pluginCode -notmatch 'desktop_storage\.js') {
    throw 'Export the updated IP2Live plugin before preparing the Windows release.'
}

$sourceSongsPath = Join-Path $sourceRoot 'resources\app\build\songs.json'
$audioPluginRoot = if ($syncProjectPlugin) { $projectPluginRoot } else {
    Join-Path $sourceRoot 'resources\app\build\Plugins\IP2Live_Core'
}
$bundledSongNames = @(
    Get-BundledPrologueSongNames -PluginRoot $audioPluginRoot
    Get-BundledGameplaySongNames -PluginRoot $audioPluginRoot
    Get-BundledStoryEndingSongNames -PluginRoot $audioPluginRoot
) | Sort-Object
Assert-CustomSongsRegistered -ExpectedNames $customSongNames -ExportedSongsPath $sourceSongsPath -BundledSongNames $bundledSongNames

$sourcePackagePath = Join-Path $sourceRoot 'resources\app\package.json'
try {
    $sourcePackage = [IO.File]::ReadAllText($sourcePackagePath) | ConvertFrom-Json
} catch {
    throw "The exported package.json is not valid JSON: $($_.Exception.Message)"
}
if ($sourcePackage.main -ne 'main.js' -or $sourcePackage.type -ne 'module') {
    throw 'The export package must use main.js and type=module.'
}

$templateRoot = Join-Path $repositoryRoot 'deployment\windows'
$templateFiles = @('main.js', 'preload.cjs', 'storage-service.js', 'pvp-service.js')
$pvpRulesSource = Assert-RequiredFile -Root $repositoryRoot -RelativePath 'Plugins\IP2Live_Core\modules\pvp_rules.js'
foreach ($templateFile in $templateFiles) {
    Assert-RequiredFile -Root $templateRoot -RelativePath $templateFile | Out-Null
}

if (-not $PSCmdlet.ShouldProcess($destinationRoot, "Create a prepared IP2Live release from $sourceRoot")) {
    return
}

$copyExclusions = @()
if ($syncProjectPlugin) {
    $copyExclusions += 'resources\app\build\Plugins\IP2Live_Core'
}
Copy-ReleaseTree -Source $sourceRoot -Destination $destinationRoot -AdditionalExcludedDirectories $copyExclusions

$destinationApp = Join-Path $destinationRoot 'resources\app'
if ($syncProjectPlugin) {
    $destinationPluginRoot = Join-Path $destinationApp 'build\Plugins\IP2Live_Core'
    Copy-ReleaseTree -Source $projectPluginRoot -Destination $destinationPluginRoot
    Assert-CopiedTreeMatches -Source $projectPluginRoot -Destination $destinationPluginRoot
}

foreach ($templateFile in $templateFiles) {
    Copy-Item -LiteralPath (Join-Path $templateRoot $templateFile) -Destination (Join-Path $destinationApp $templateFile) -Force -ErrorAction Stop
}
Copy-Item -LiteralPath $pvpRulesSource -Destination (Join-Path $destinationApp 'pvp-rules.cjs') -Force -ErrorAction Stop
$obsoletePreload = Join-Path $destinationApp 'preload.js'
if (Test-Path -LiteralPath $obsoletePreload -PathType Leaf) {
    Remove-Item -LiteralPath $obsoletePreload -Force -ErrorAction Stop
}

$destinationPackagePath = Join-Path $destinationApp 'package.json'
$destinationPackage = [IO.File]::ReadAllText($destinationPackagePath) | ConvertFrom-Json
$destinationPackage.name = 'ip2live'
if ($destinationPackage.PSObject.Properties.Name -contains 'productName') {
    $destinationPackage.productName = 'IP2Live'
} else {
    $destinationPackage | Add-Member -MemberType NoteProperty -Name productName -Value 'IP2Live'
}
$destinationPackage.main = 'main.js'
$destinationPackage.type = 'module'
if ($ReleaseVersion) { $destinationPackage.version = $ReleaseVersion }
Write-Utf8WithoutBom -LiteralPath $destinationPackagePath -Content (($destinationPackage | ConvertTo-Json -Depth 100) + [Environment]::NewLine)

$saveDirectory = Join-Path $destinationApp 'build\Saves'
if (-not (Test-Path -LiteralPath $saveDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $saveDirectory -ErrorAction Stop | Out-Null
}

$hashes = [ordered]@{}
foreach ($runtimeFile in @('main.js', 'preload.cjs', 'storage-service.js', 'pvp-service.js', 'pvp-rules.cjs', 'package.json')) {
    $hashes[$runtimeFile] = (Get-FileHash -LiteralPath (Join-Path $destinationApp $runtimeFile) -Algorithm SHA256).Hash.ToLowerInvariant()
}
$manifest = [ordered]@{
    applicationId = 'IP2Live'
    hostTemplateVersion = 2
    sourceDirectoryName = [IO.Path]::GetFileName($sourceRoot)
    projectPluginSynced = $syncProjectPlugin
    verifiedCustomSongs = $customSongNames
    verifiedBundledSongs = $bundledSongNames
    excludedFromRelease = @('embedded .git directories', 'build/Saves/*.json developer saves')
    runtimeSha256 = $hashes
}
Write-Utf8WithoutBom -LiteralPath (Join-Path $destinationApp 'ip2live-runtime-manifest.json') -Content (($manifest | ConvertTo-Json -Depth 10) + [Environment]::NewLine)

foreach ($runtimeFile in $templateFiles) {
    $sourceHash = (Get-FileHash -LiteralPath (Join-Path $templateRoot $runtimeFile) -Algorithm SHA256).Hash
    $destinationHash = (Get-FileHash -LiteralPath (Join-Path $destinationApp $runtimeFile) -Algorithm SHA256).Hash
    if ($sourceHash -ne $destinationHash) {
        throw "Runtime host verification failed after copying $runtimeFile."
    }
}

$embeddedGit = Get-ChildItem -LiteralPath $destinationRoot -Directory -Filter '.git' -Recurse -Force -ErrorAction SilentlyContinue
if ($embeddedGit) { throw 'Prepared release validation failed: an embedded .git directory remains.' }
$embeddedSaves = Get-ChildItem -LiteralPath $saveDirectory -File -Filter '*.json' -Force -ErrorAction SilentlyContinue
if ($embeddedSaves) { throw 'Prepared release validation failed: developer save JSON remains in build\Saves.' }

Write-Host "Prepared IP2Live Windows release: $destinationRoot"
Write-Host "Durable data location at runtime: %LOCALAPPDATA%\IP2Live"
Write-Host 'The source RPG Paper Maker export was not modified.'
