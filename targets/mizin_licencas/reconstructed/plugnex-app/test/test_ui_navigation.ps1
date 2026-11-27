# Real Win32 integration test. Requires the local catalog backend running.
# Does not log out, change the profile, activate licenses, or buy anything.
param([string]$ExePath = (Join-Path $PSScriptRoot '..\build\Plugnex.exe'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class PlugnexUiTest {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr hwnd, int id);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref POINT pt);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")] public static extern IntPtr SendText(IntPtr hwnd, uint message, IntPtr wparam, string text);
    public static void SetText(IntPtr hwnd, string text) { SendText(hwnd, 0x000C, IntPtr.Zero, text); }
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int size);
    [DllImport("user32.dll")] public static extern bool RedrawWindow(IntPtr hwnd, IntPtr rect, IntPtr region, uint flags);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("dwmapi.dll")] public static extern int DwmFlush();
    public static IntPtr WaitWindow() {
        var timer = Stopwatch.StartNew();
        IntPtr hwnd;
        while ((hwnd = FindWindow("PlugnexAppWindow", "PLUGNEX")) == IntPtr.Zero) {
            if (timer.ElapsedMilliseconds > 15000) throw new Exception("Timed out waiting for PLUGNEX window");
            Thread.Sleep(25);
        }
        return hwnd;
    }
    [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")] public static extern IntPtr ReadText(IntPtr hwnd, uint message, IntPtr wparam, StringBuilder text);
    public static string Text(IntPtr hwnd) {
        // GetWindowText cannot reliably retrieve another process's EDIT text.
        var text = new StringBuilder(512);
        ReadText(hwnd, 0x000D, new IntPtr(text.Capacity), text);
        return text.ToString();
    }
    public static int Width(IntPtr hwnd) { RECT r; GetClientRect(hwnd, out r); return r.Right; }
    public static int Height(IntPtr hwnd) { RECT r; GetClientRect(hwnd, out r); return r.Bottom; }
    public static void Click(IntPtr hwnd, int x, int y) {
        var pt = new IntPtr((y << 16) | (x & 0xffff));
        SendMessage(hwnd, 0x0201, new IntPtr(1), pt);
        SendMessage(hwnd, 0x0202, IntPtr.Zero, pt);
        RedrawWindow(hwnd, IntPtr.Zero, IntPtr.Zero, 0x0185); DwmFlush();
    }
    public static Bitmap Capture(IntPtr hwnd) {
        SetForegroundWindow(hwnd); RedrawWindow(hwnd, IntPtr.Zero, IntPtr.Zero, 0x0185); DwmFlush();
        POINT pt = new POINT(); ClientToScreen(hwnd, ref pt);
        var image = new Bitmap(Width(hwnd), Height(hwnd));
        using (var g = Graphics.FromImage(image)) g.CopyFromScreen(pt.X, pt.Y, 0, 0, image.Size);
        return image;
    }
    public static void Save(IntPtr hwnd, string path) { using(var b = Capture(hwnd)) b.Save(path, ImageFormat.Png); }
    public static void Crop(IntPtr hwnd, string path, int x, int y, int w, int h) {
        using(var b = Capture(hwnd)) using(var zoom = new Bitmap(w * 2, h * 2)) {
            using(var g = Graphics.FromImage(zoom)) {
                g.InterpolationMode = InterpolationMode.NearestNeighbor;
                g.PixelOffsetMode = PixelOffsetMode.Half;
                g.DrawImage(b, new Rectangle(0,0,w*2,h*2), new Rectangle(x,y,w,h), GraphicsUnit.Pixel);
            }
            zoom.Save(path, ImageFormat.Png);
        }
    }
    public static bool Pixel(IntPtr hwnd, int x, int y, int r, int g, int b) {
        using(var image = Capture(hwnd)) { var p = image.GetPixel(x,y); return p.R == r && p.G == g && p.B == b; }
    }
    public static void WaitEnabled(IntPtr button) {
        var timer = Stopwatch.StartNew();
        while (!IsWindowEnabled(button)) {
            if (timer.ElapsedMilliseconds > 15000) throw new Exception("Timed out waiting for catalog synchronization");
            Thread.Sleep(25);
        }
    }
}
'@ -ReferencedAssemblies System.Drawing

function Assert-Ui([bool]$condition, [string]$message) {
    if (-not $condition) { throw "FAIL: $message" }
    "PASS: $message"
}
function Invoke-Tab([int]$index) {
    $centers = @(60, 180, 308, 445, 590)
    [PlugnexUiTest]::Click($window, $centers[$index], 94)
}
function Assert-Tab([int]$index) {
    $centers = @(60, 180, 308, 445, 590)
    Assert-Ui ([PlugnexUiTest]::Pixel($window, $centers[$index], 76, 0x30, 0x3B, 0x4B)) "active tab $index matches the navigation click"
    Assert-Ui ([PlugnexUiTest]::IsWindowVisible($search) -eq ($index -ne 4)) 'search visibility matches the current screen'
    Assert-Ui ([PlugnexUiTest]::IsWindowVisible($refresh) -eq ($index -ne 4)) 'refresh visibility matches the current screen'
}
function Get-MenuTop {
    if ([PlugnexUiTest]::IsWindowVisible($search)) { return 386 }
    return 338
}

$ExePath = (Resolve-Path -LiteralPath $ExePath).Path
$window = [PlugnexUiTest]::FindWindow('PlugnexAppWindow', 'PLUGNEX')
if ($window -eq [IntPtr]::Zero) {
    $app = Start-Process -FilePath $ExePath -PassThru
    if (-not $app.WaitForInputIdle(15000)) { throw 'PLUGNEX did not initialize its window' }
    $window = [PlugnexUiTest]::WaitWindow()
}
Assert-Ui ($window -ne [IntPtr]::Zero) 'real PLUGNEX window is available'
[uint32]$appId = 0
$null = [PlugnexUiTest]::GetWindowThreadProcessId($window, [ref]$appId)
Assert-Ui ((Get-Process -Id $appId).Path -eq $ExePath) 'window belongs to the requested binary'
$null = [PlugnexUiTest]::ShowWindow($window, 9)
$null = [PlugnexUiTest]::SetForegroundWindow($window)
$null = [PlugnexUiTest]::SetWindowPos($window, [IntPtr]::Zero, 50, 50, 1280, 820, 0x0014)
$search = [PlugnexUiTest]::GetDlgItem($window, 2004)
$refresh = [PlugnexUiTest]::GetDlgItem($window, 2008)
Assert-Ui ($refresh -ne [IntPtr]::Zero) 'refresh is a dedicated native BUTTON'
[PlugnexUiTest]::WaitEnabled($refresh)

Invoke-Tab 0
[PlugnexUiTest]::SetText($search, '') | Out-Null
for ($i = 0; $i -lt 4; $i++) {
    $top = Get-MenuTop
    [PlugnexUiTest]::Click($window, 60, ($top + $i * 30 + 15))
    Assert-Tab ($i + 1)
    $newTop = Get-MenuTop
    Assert-Ui ([PlugnexUiTest]::Pixel($window, 15, ($newTop + $i * 30 + 3), 0x35, 0x43, 0x55)) 'sidebar selection follows the active tab'
}
Invoke-Tab 0
[PlugnexUiTest]::Click($window, ([PlugnexUiTest]::Width($window) - 200), 20)
Assert-Tab 4
'PASS: account header opens Configuracoes'

$out = Join-Path (Split-Path $PSScriptRoot -Parent) 'build\ui-validation'
New-Item -ItemType Directory -Path $out -Force | Out-Null
[PlugnexUiTest]::Save($window, (Join-Path $out 'settings.png'))
Invoke-Tab 0
[PlugnexUiTest]::SetText($search, 'Outliner') | Out-Null
Assert-Ui ([PlugnexUiTest]::Pixel($window, 500, 361, 0x38, 0x3B, 0x40)) 'live search displays the matching Outliner row'
Assert-Ui (-not [PlugnexUiTest]::Pixel($window, 500, 419, 0x38, 0x3B, 0x40)) 'live search filters the other catalog rows'
[PlugnexUiTest]::SendMessage($refresh, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
[PlugnexUiTest]::WaitEnabled($refresh)
Assert-Ui ([PlugnexUiTest]::Text($search) -eq 'Outliner') 'refresh preserves the search text'
Assert-Ui ([PlugnexUiTest]::Text($refresh) -eq ('Atualizar cat' + [char]0x00E1 + 'logo')) 'refresh returns to its ready state'
Assert-Ui ([PlugnexUiTest]::Pixel($window, 500, 361, 0x38, 0x3B, 0x40)) 'matching catalog row remains after synchronization'
[PlugnexUiTest]::Save($window, (Join-Path $out 'search-preserved.png'))
[PlugnexUiTest]::SetText($search, '') | Out-Null
Assert-Ui ([PlugnexUiTest]::Pixel($window, 500, 419, 0x38, 0x3B, 0x40)) 'clearing search restores the real catalog rows'

$null = [PlugnexUiTest]::SetWindowPos($window, [IntPtr]::Zero, 50, 50, 1040, 640, 0x0014)
$s = New-Object PlugnexUiTest+RECT
$r = New-Object PlugnexUiTest+RECT
$null = [PlugnexUiTest]::GetWindowRect($search, [ref]$s)
$null = [PlugnexUiTest]::GetWindowRect($refresh, [ref]$r)
Assert-Ui ($s.Right + 24 -lt $r.Left) 'search and refresh do not overlap at minimum window width'
[PlugnexUiTest]::Click($window, 60, 431)
Assert-Tab 2
[PlugnexUiTest]::Save($window, (Join-Path $out 'minimum-size.png'))
$null = [PlugnexUiTest]::SetWindowPos($window, [IntPtr]::Zero, 50, 50, 1280, 820, 0x0014)
Invoke-Tab 0
$width = [PlugnexUiTest]::Width($window)
[PlugnexUiTest]::Save($window, (Join-Path $out 'updated.png'))
[PlugnexUiTest]::Crop($window, (Join-Path $out 'header-zoom.png'), ($width - 430), 0, 425, 44)
[PlugnexUiTest]::Crop($window, (Join-Path $out 'button-zoom.png'), ($width - 430), 117, 425, 48)
[PlugnexUiTest]::Crop($window, (Join-Path $out 'menu-zoom.png'), 5, 362, 210, 150)
"PASS: screenshots and 2x zooms saved in $out"
"PASS: native GUI integration checks complete; PLUGNEX remains open (PID $appId)"
