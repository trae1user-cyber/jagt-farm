# Rebuilds build/preview.html: a single self-contained copy of the site
# (all JS and CSS inlined) used for local preview. The real site is plain
# index.html + js/ + css/ - this bundle changes nothing about deployment.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$html = Get-Content (Join-Path $root "index.html") -Raw

# Inline every local <script src="...">
$html = [regex]::Replace($html, '<script src="([^"]+)"></script>', {
  param($m)
  $p = Join-Path $root ($m.Groups[1].Value -replace "/", "\")
  if (Test-Path $p) { "<script>`n" + (Get-Content $p -Raw) + "`n</script>" } else { $m.Value }
})

# Inline every local stylesheet <link ... href="..."> (self-closing or not)
$html = [regex]::Replace($html, '<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>', {
  param($m)
  $p = Join-Path $root ($m.Groups[1].Value -replace "/", "\")
  if (Test-Path $p) { "<style>`n" + (Get-Content $p -Raw) + "`n</style>" } else { $m.Value }
})

New-Item -ItemType Directory -Force (Join-Path $root "build") | Out-Null
Set-Content (Join-Path $root "build\preview.html") $html -Encoding UTF8
$kb = [math]::Round((Get-Item (Join-Path $root "build\preview.html")).Length / 1KB)
Write-Host "build/preview.html regenerated ($kb KB)"
