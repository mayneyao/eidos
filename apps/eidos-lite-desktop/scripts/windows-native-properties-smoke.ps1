param(
  [Parameter(Mandatory = $true)][string]$WindowHandle,
  [Parameter(Mandatory = $true)][string]$EvidenceDirectory
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class EidosNativeWindow {
  [StructLayout(LayoutKind.Sequential)]
  public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll")] public static extern IntPtr GetSystemMenu(IntPtr hwnd, bool revert);
  [DllImport("user32.dll")] public static extern uint GetMenuState(IntPtr menu, uint item, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int length);
}
'@

$handle = [IntPtr]::new([long]::Parse($WindowHandle))
if (-not [EidosNativeWindow]::IsWindow($handle)) { throw 'Properties HWND does not exist' }
$style = [EidosNativeWindow]::GetWindowLong($handle, -16)
$hasMinimizeButton = ($style -band 0x00020000) -ne 0
$hasMaximizeButton = ($style -band 0x00010000) -ne 0
$hasSystemMenu = ($style -band 0x00080000) -ne 0
$systemMenu = [EidosNativeWindow]::GetSystemMenu($handle, $false)
$closeState = [EidosNativeWindow]::GetMenuState($systemMenu, 0xF060, 0)
if ($hasMinimizeButton -or $hasMaximizeButton -or -not $hasSystemMenu) {
  throw 'Live Windows caption styles must expose only close, without minimize/maximize'
}
if ($closeState -eq [uint32]::MaxValue -or ($closeState -band 3) -ne 0) {
  throw 'Native close command is absent or disabled'
}
[void][EidosNativeWindow]::ShowWindow($handle, 5)
[void][EidosNativeWindow]::SetForegroundWindow($handle)
$focusDeadline = [DateTime]::UtcNow.AddSeconds(5)
while ([EidosNativeWindow]::GetForegroundWindow() -ne $handle) {
  if ([DateTime]::UtcNow -gt $focusDeadline) { throw 'Exact properties HWND did not gain foreground' }
  Start-Sleep -Milliseconds 50
}
$rect = New-Object EidosNativeWindow+Rect
if (-not [EidosNativeWindow]::GetWindowRect($handle, [ref]$rect)) { throw 'Native bounds unavailable' }
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) { throw 'Native window has no visible bounds' }
New-Item -ItemType Directory -Force $EvidenceDirectory | Out-Null
$screenshot = Join-Path $EvidenceDirectory 'windows-native-properties.png'
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
  $bitmap.Save($screenshot, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
$title = New-Object System.Text.StringBuilder 512
[void][EidosNativeWindow]::GetWindowText($handle, $title, $title.Capacity)
if ([EidosNativeWindow]::GetForegroundWindow() -ne $handle) { throw 'Foreground changed before native keyboard action' }
# Send through Windows to the exact foreground HWND. No Electron close or DOM key event is used.
[System.Windows.Forms.SendKeys]::SendWait('%{F4}')
$closeDeadline = [DateTime]::UtcNow.AddSeconds(10)
while ([EidosNativeWindow]::IsWindow($handle)) {
  if ([DateTime]::UtcNow -gt $closeDeadline) { throw 'Native Alt+F4 did not close the properties HWND' }
  Start-Sleep -Milliseconds 50
}
$result = [ordered]@{
  platform = 'win32'
  title = $title.ToString()
  liveNativeStyles = $true
  minimizeButton = $hasMinimizeButton
  maximizeButton = $hasMaximizeButton
  closeCommandEnabled = $true
  screenshot = 'windows-native-properties.png'
  screenshotMethod = 'System.Drawing.CopyFromScreen including native caption'
  altF4 = 'Windows SendKeys to exact foreground HWND'
  destroyedAfterAltF4 = $true
}
$json = $result | ConvertTo-Json -Depth 4
$json | Set-Content -Encoding UTF8 (Join-Path $EvidenceDirectory 'windows-native-properties.json')
$json
