param(
  [string]$Version = $env:EIDOS_VERSION,
  [string]$InstallDir = $env:EIDOS_INSTALL_DIR
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$DefaultRepository = "mayneyao/eidos"
$Repository = if ($env:EIDOS_GITHUB_REPOSITORY) { $env:EIDOS_GITHUB_REPOSITORY } else { $DefaultRepository }
$LatestUrl = if ($env:EIDOS_LATEST_URL) {
  $env:EIDOS_LATEST_URL
} elseif ($Repository -eq $DefaultRepository) {
  "https://download.eidos.space/cli/latest"
} else {
  "https://raw.githubusercontent.com/$Repository/dev/apps/cli/LATEST"
}
$DownloadBase = if ($env:EIDOS_DOWNLOAD_BASE) { $env:EIDOS_DOWNLOAD_BASE } else { "https://github.com/$Repository/releases/download" }
if (-not $InstallDir) {
  $InstallDir = Join-Path $HOME ".local\bin"
}

if (-not $Version) {
  $Version = (Invoke-RestMethod -Uri $LatestUrl).Trim()
}
$Version = $Version -replace '^cli-v', '' -replace '^v', ''
if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$') {
  throw "Invalid Eidos CLI version: $Version"
}

$Architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
if ($Architecture -ne "X64") {
  throw "Unsupported Windows architecture: $Architecture"
}

$Target = "x86_64-pc-windows-msvc"
$Tag = "cli-v$Version"
$Archive = "eidos-cli-v$Version-$Target.zip"
$ReleaseUrl = "$DownloadBase/$Tag"
$TemporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("eidos-cli-" + [guid]::NewGuid())

try {
  New-Item -ItemType Directory -Path $TemporaryDirectory | Out-Null
  $ArchivePath = Join-Path $TemporaryDirectory $Archive
  $ChecksumsPath = Join-Path $TemporaryDirectory "SHA256SUMS"

  Write-Host "Downloading Eidos CLI $Version for $Target..."
  Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseUrl/$Archive" -OutFile $ArchivePath
  Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseUrl/SHA256SUMS" -OutFile $ChecksumsPath

  $ChecksumLine = Get-Content $ChecksumsPath | Where-Object { $_ -match ("\s" + [regex]::Escape($Archive) + "$") } | Select-Object -First 1
  if (-not $ChecksumLine) {
    throw "SHA256SUMS has no entry for $Archive"
  }
  $ExpectedChecksum = ($ChecksumLine -split '\s+')[0].ToLowerInvariant()
  $ActualChecksum = (Get-FileHash -Algorithm SHA256 $ArchivePath).Hash.ToLowerInvariant()
  if ($ActualChecksum -ne $ExpectedChecksum) {
    throw "Checksum mismatch for $Archive"
  }

  $ExtractDirectory = Join-Path $TemporaryDirectory "extract"
  Expand-Archive -Path $ArchivePath -DestinationPath $ExtractDirectory
  $SourceBinary = Join-Path $ExtractDirectory "eidos.exe"
  if (-not (Test-Path $SourceBinary -PathType Leaf)) {
    throw "Archive does not contain eidos.exe"
  }

  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  $TargetBinary = Join-Path $InstallDir "eidos.exe"
  $TemporaryTarget = Join-Path $InstallDir (".eidos.tmp." + $PID)
  Copy-Item -Force $SourceBinary $TemporaryTarget
  Move-Item -Force $TemporaryTarget $TargetBinary

  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $PathEntries = @($UserPath -split ';' | Where-Object { $_ })
  if (-not ($PathEntries | Where-Object { $_.TrimEnd('\') -ieq $InstallDir.TrimEnd('\') })) {
    $NewPath = (@($PathEntries) + $InstallDir) -join ';'
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    Write-Host "Added $InstallDir to your user PATH."
  }

  Write-Host "Installed Eidos CLI $Version to $TargetBinary"
  Write-Host "Restart your terminal before running eidos."
}
finally {
  if (Test-Path $TemporaryDirectory) {
    Remove-Item -Recurse -Force $TemporaryDirectory
  }
}
