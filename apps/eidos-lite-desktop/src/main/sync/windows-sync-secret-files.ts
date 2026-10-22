import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"

const execute = promisify(execFile)

export interface WindowsSyncSecretFiles {
  prepareDirectory(directory: string): Promise<void>
  validateDirectory(directory: string): Promise<void>
  validateFile(file: string): Promise<void>
  protectFile(file: string): Promise<void>
}

export function createWindowsPowerShellEnvironment(): NodeJS.ProcessEnv {
  // Node can inherit PowerShell 7 module paths that Windows PowerShell cannot
  // load. Environment variable names are case-insensitive on Windows.
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => name.toLowerCase() !== "psmodulepath"
    )
  )
}

// Paths travel as data in the child environment. Passwords and ciphertext never
// enter PowerShell. Use the system executable, not a PATH-resolved command.
const script = `
$ErrorActionPreference = 'Stop'
$env:PSModulePath = [System.IO.Path]::Combine($PSHOME, 'Modules')
$target = $env:EIDOS_SYNC_SECRET_PATH
$operation = $env:EIDOS_SYNC_SECRET_OPERATION
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
function Assert-NoReparse([string] $value) {
  $cursor = $value
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Reparse points are not allowed'
      }
    }
    $parent = [System.IO.Path]::GetDirectoryName($cursor)
    if ($parent -eq $cursor) { break }
    $cursor = $parent
  }
}
function New-PrivateAcl([bool] $directory) {
  if ($directory) { $acl = [System.Security.AccessControl.DirectorySecurity]::new() }
  else { $acl = [System.Security.AccessControl.FileSecurity]::new() }
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  $inherit = [System.Security.AccessControl.InheritanceFlags]::None
  if ($directory) { $inherit = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' }
  foreach ($principal in @($sid, $system)) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
      $principal, [System.Security.AccessControl.FileSystemRights]::FullControl,
      $inherit, [System.Security.AccessControl.PropagationFlags]::None,
      [System.Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
  }
  return $acl
}
Assert-NoReparse $target
if ($operation -eq 'prepare-directory' -and !(Test-Path -LiteralPath $target)) {
  $directory = [System.IO.DirectoryInfo]::new($target)
  $directory.Create((New-PrivateAcl $true))
}
if ($operation -eq 'protect-file') {
  Set-Acl -LiteralPath $target -AclObject (New-PrivateAcl $false)
}
$item = Get-Item -LiteralPath $target -Force
$isDirectory = $operation -eq 'prepare-directory' -or $operation -eq 'validate-directory'
if ($item.PSIsContainer -ne $isDirectory) { throw 'Unexpected file type' }
$acl = Get-Acl -LiteralPath $target
if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) {
  throw 'Unexpected owner'
}
if ($isDirectory -and !$acl.AreAccessRulesProtected) { throw 'Directory inherits permissions' }
$hasOwner = $false
foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
  if ($rule.IdentityReference.Value -ne $sid.Value -and $rule.IdentityReference.Value -ne $system.Value) {
    throw 'Unexpected access rule'
  }
  if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
    throw 'Unexpected deny rule'
  }
  if ($rule.IdentityReference.Value -eq $sid.Value -and
      ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq
      [System.Security.AccessControl.FileSystemRights]::FullControl) { $hasOwner = $true }
}
if (!$hasOwner) { throw 'Owner access is missing' }
`

async function protect(target: string, operation: string): Promise<void> {
  const systemRoot = process.env.SystemRoot
  if (!systemRoot || !path.isAbsolute(systemRoot) || !path.isAbsolute(target))
    throw new Error("Windows secure storage is unavailable")
  try {
    await execute(
      path.join(
        systemRoot,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe"
      ),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      {
        windowsHide: true,
        timeout: 15_000,
        maxBuffer: 16_384,
        env: {
          ...createWindowsPowerShellEnvironment(),
          EIDOS_SYNC_SECRET_PATH: target,
          EIDOS_SYNC_SECRET_OPERATION: operation,
        },
      }
    )
  } catch (cause) {
    throw new Error("Windows Sync password storage could not be protected", {
      cause,
    })
  }
}

export const windowsSyncSecretFiles: WindowsSyncSecretFiles = {
  prepareDirectory: (directory) => protect(directory, "prepare-directory"),
  validateDirectory: (directory) => protect(directory, "validate-directory"),
  validateFile: (file) => protect(file, "validate-file"),
  protectFile: (file) => protect(file, "protect-file"),
}
