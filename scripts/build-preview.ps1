# Rebuilds build/preview.html: a single self-contained copy of the site
# (all JS and CSS inlined) used for local preview. The real site is plain
# index.html + js/ + css/ - this bundle changes nothing about deployment.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
# Read as UTF-8 explicitly (Get-Content defaults to ANSI on Windows PowerShell 5.1
# for BOM-less files, which mojibakes em-dashes/arrows). [IO.File]::ReadAllText
# detects BOM and defaults to UTF-8.
$html = [IO.File]::ReadAllText((Join-Path $root "index.html"))

# Inline every local <script src="...">
$html = [regex]::Replace($html, '<script src="([^"]+)"></script>', {
  param($m)
  $p = Join-Path $root ($m.Groups[1].Value -replace "/", "\")
  if (Test-Path $p) { "<script>`n" + [IO.File]::ReadAllText($p) + "`n</script>" } else { $m.Value }
})

# Inline every local stylesheet <link ... href="..."> (self-closing or not)
$html = [regex]::Replace($html, '<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>', {
  param($m)
  $p = Join-Path $root ($m.Groups[1].Value -replace "/", "\")
  if (Test-Path $p) { "<style>`n" + [IO.File]::ReadAllText($p) + "`n</style>" } else { $m.Value }
})

# Inline every asset (jpg/svg/png) as a base64 data URI. This catches ALL
# references left in the final HTML: src=, url('...') inside inlined CSS,
# and string literals inside inlined JS (e.g. sidebar photo loader).
Get-ChildItem (Join-Path $root "assets") -Include *.jpg,*.jpeg,*.png,*.svg -File -Recurse | ForEach-Object {
  $rel = "assets/" + $_.Name
  $mime = switch ($_.Extension.ToLower()) {
    ".jpg"  { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".png"  { "image/png" }
    ".svg"  { "image/svg+xml" }
  }
  $uri = "data:$mime;base64," + [Convert]::ToBase64String([IO.File]::ReadAllBytes($_.FullName))
  $html = $html.Replace($rel, $uri)
}

New-Item -ItemType Directory -Force (Join-Path $root "build") | Out-Null
[IO.File]::WriteAllText((Join-Path $root "build\preview.html"), $html, (New-Object System.Text.UTF8Encoding($true)))
$kb = [math]::Round((Get-Item (Join-Path $root "build\preview.html")).Length / 1KB)
Write-Host "build/preview.html regenerated ($kb KB)"
