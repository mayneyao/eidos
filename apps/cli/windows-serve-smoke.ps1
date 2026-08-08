param(
  [Parameter(Mandatory = $true)]
  [string]$Binary
)

$ErrorActionPreference = "Stop"
$binaryPath = (Resolve-Path $Binary).Path
$qaDirectory = Join-Path ([System.IO.Path]::GetTempPath()) (
  "eidos-cli-windows-serve-{0}" -f [guid]::NewGuid().ToString("N")
)
$filePath = Join-Path $qaDirectory "windows-serve.eidos"
$process = $null

try {
  New-Item -ItemType Directory -Path $qaDirectory | Out-Null

  $fields = '[{"name":"Title","type":"text"},{"name":"Priority","type":"select"}]'
  & $binaryPath create $filePath --title "Windows Serve Smoke" --table "Tasks" --fields $fields | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "eidos create exited with code $LASTEXITCODE"
  }

  $listener = [System.Net.Sockets.TcpListener]::new(
    [System.Net.IPAddress]::Loopback,
    0
  )
  $listener.Start()
  $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  $listener.Stop()

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $binaryPath
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.ArgumentList.Add("serve")
  $startInfo.ArgumentList.Add($filePath)
  $startInfo.ArgumentList.Add("--port")
  $startInfo.ArgumentList.Add($port.ToString())

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) {
    throw "failed to start eidos serve"
  }

  $baseUrl = "http://127.0.0.1:$port"
  $index = $null
  for ($attempt = 0; $attempt -lt 80; $attempt += 1) {
    if ($process.HasExited) {
      $stdout = $process.StandardOutput.ReadToEnd()
      $stderr = $process.StandardError.ReadToEnd()
      throw "eidos serve exited early ($($process.ExitCode))`n$stdout`n$stderr"
    }
    try {
      $index = Invoke-WebRequest -Uri "$baseUrl/" -TimeoutSec 2
      break
    }
    catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if ($null -eq $index -or $index.StatusCode -ne 200) {
    throw "embedded editor did not become ready at $baseUrl"
  }

  $manifest = Invoke-RestMethod -Uri "$baseUrl/api/manifest" -TimeoutSec 2
  if ($manifest.mode -ne "cli" -or $manifest.access -ne "readwrite") {
    throw "unexpected CLI manifest: $($manifest | ConvertTo-Json -Compress)"
  }

  $openResponse = Invoke-RestMethod `
    -Uri "$baseUrl/api/runtime/open" `
    -Method Post `
    -ContentType "application/json" `
    -Body '{"access":"readwrite"}' `
    -TimeoutSec 10
  if ($openResponse.ok -ne $true) {
    throw "embedded runtime open failed: $($openResponse | ConvertTo-Json -Compress -Depth 8)"
  }

  $assets = [regex]::Matches(
    $index.Content,
    '(?:src|href)="\./([^"]+)"'
  )
  $hasEditorRoot = $false
  foreach ($assetMatch in $assets) {
    $asset = Invoke-WebRequest `
      -Uri "$baseUrl/$($assetMatch.Groups[1].Value)" `
      -TimeoutSec 10
    if ($asset.Content.Contains("data-eidos-file-root")) {
      $hasEditorRoot = $true
    }
  }
  if (-not $hasEditorRoot) {
    throw "embedded assets do not contain the shared Eidos File editor root"
  }

  Write-Host "Windows embedded serve smoke passed at $baseUrl"
}
finally {
  if ($null -ne $process -and -not $process.HasExited) {
    $process.Kill($true)
    $process.WaitForExit()
  }
  if (Test-Path $qaDirectory) {
    Remove-Item -Recurse -Force $qaDirectory
  }
}
