# ============================================================
#  Genera el instalador de Windows de la app
#  "Gestor de Personal - Calendario de Turnos" (Tauri 2 + Vue)
#
#  Uso (en Windows, dentro de la carpeta del proyecto):
#      powershell -ExecutionPolicy Bypass -File build-windows.ps1
#
#  Uso avanzado (genera tambien el .msi ademas del .exe):
#      powershell -ExecutionPolicy Bypass -File build-windows.ps1 -Tipo msi
#
#  Requisitos previos (una sola vez):
#   1. Node.js >= 20        -> https://nodejs.org
#   2. Rust (rustup, MSVC)  -> https://rustup.rs
#   3. Visual Studio 2022 Build Tools con la carga
#      "Desarrollo para escritorio con C++" (incluye MSVC y SDK de Windows)
#      -> https://visualstudio.microsoft.com/es/downloads/
#   4. WebView2 Runtime     -> ya viene con Windows 11 (y Windows 10 actualizado)
#
#  Nota: la primera compilacion descarga y compila cientos de crates de
#  Rust (~10-20 min); las siguientes son mucho mas rapidas.
# ============================================================
param(
  [ValidateSet("exe", "msi")]
  [string]$Tipo = "exe"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

function Test-Comando([string]$nombre, [string]$guia) {
  if (Get-Command $nombre -ErrorAction SilentlyContinue) { return $true }
  Write-Host "`n[ERROR] No se encuentra '$nombre'." -ForegroundColor Red
  Write-Host "        $guia" -ForegroundColor Yellow
  return $false
}

Write-Host "`n=== Gestor de Personal - Compilacion del instalador de Windows ===" -ForegroundColor Cyan

# --- 1. Comprobaciones de prerrequisitos -------------------------------
$ok = $true
$ok = (Test-Comando "node" "Instala Node.js >= 20 desde https://nodejs.org y vuelve a abrir la terminal.") -and $ok
$ok = (Test-Comando "npm"  "npm viene con Node.js.") -and $ok
if (Test-Comando "rustc" "Instala Rust desde https://rustup.rs y reinicia la terminal.") {
  Write-Host "   - $(rustc --version)" -ForegroundColor DarkGray
} else { $ok = $false }

if (-not $ok) {
  Write-Host "`nFaltan requisitos. Corrigelos y vuelve a ejecutar este script.`n" -ForegroundColor Red
  exit 1
}

# --- 2. Nos movemos a la carpeta web/ del proyecto ----------------------
$webDir = Join-Path $PSScriptRoot "web"
if (-not (Test-Path (Join-Path $webDir "package.json"))) {
  Write-Host "`n[ERROR] No encuentro la carpeta 'web' junto a este script." -ForegroundColor Red
  exit 1
}
Set-Location $webDir

# --- 3. Dependencias npm (solo si faltan) -------------------------------
if (-not (Test-Path "node_modules")) {
  Write-Host "`nInstalando dependencias npm (primera vez)...`n" -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERROR] Fallo en npm install." -ForegroundColor Red
    exit 1
  }
}

# --- 4. Compilar el instalador ------------------------------------------
if ($Tipo -eq "msi") {
  Write-Host "`nCompilando .exe (NSIS) + .msi (WiX)...`n" -ForegroundColor Yellow
  Write-Host "  Nota: si falla por 'VBSCRIPT'/'light.exe', instala la caracteristica VBSCRIPT de Windows" -ForegroundColor DarkGray
  Write-Host "  o ejecuta este script sin '-Tipo msi' (genera solo el .exe).`n" -ForegroundColor DarkGray
  npm run tauri:build
} else {
  Write-Host "`nCompilando instalador .exe (NSIS)...`n" -ForegroundColor Yellow
  npm run tauri:build -- --bundles nsis
}
if ($LASTEXITCODE -ne 0) {
  Write-Host "`n[ERROR] La compilacion fallo. Revisa el mensaje anterior." -ForegroundColor Red
  exit 1
}

# --- 5. Mostrar el resultado --------------------------------------------
Write-Host "`n=== Compilacion completada ===" -ForegroundColor Green
$nsisDir = Join-Path $webDir "src-tauri\target\release\bundle\nsis"
if (Test-Path $nsisDir) {
  $instalador = Get-ChildItem -File $nsisDir -Filter "*-setup.exe" | Select-Object -First 1
  if ($instalador) {
    Write-Host ("   -> " + $instalador.FullName + "  (" + [math]::Round($instalador.Length / 1MB, 1) + " MB)") -ForegroundColor Green
    Write-Host "`nAbriendo la carpeta del instalador...`n"
    Start-Process explorer.exe -ArgumentList ('"' + $nsisDir + '"') -ErrorAction SilentlyContinue
  } else {
    Write-Host "   (no encuentro *-setup.exe en $nsisDir)" -ForegroundColor Yellow
  }
} else {
  Write-Host "   (no encuentro la carpeta de salida; revisa web\src-tauri\target\release\bundle)" -ForegroundColor Yellow
}
Write-Host "`nHecho. Distribuye el archivo *-setup.exe: se instala con doble clic.`n" -ForegroundColor Green
