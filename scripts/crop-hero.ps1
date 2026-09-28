Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile("C:\Users\kevin\Pictures\Screenshots\ChatGPT Image Sep 27, 2026, 04_19_41 AM.png")
Write-Host "source: $($src.Width) x $($src.Height)"

function CropSave($x, $y, $w, $h, $out) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0,0,$w,$h)), (New-Object System.Drawing.Rectangle($x,$y,$w,$h)), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $bmp.Dispose()
  Write-Host "saved $out ($w x $h)"
}

# Hero banner: CLEAN strip only — cows + barn + grass. Must avoid all baked-in
# mockup UI: search pill (y<66), hero title text (x<750), bell/date/avatar
# (y<62, x>1060), script quote (x>1330).
CropSave 750 64 580 174 "assets\hero-farm.jpg"
# Sidebar bottom photo: cow in pasture, above the baked-in tagline text (y~880)
CropSave 0 660 210 205 "assets\sidebar-cow.jpg"

$src.Dispose()
Write-Host "done"
