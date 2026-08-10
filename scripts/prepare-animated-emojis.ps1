param(
  [string]$ItFolder = "C:\Users\ahmad\Downloads\Telegram Desktop\IT",
  [string]$AnimatedFolder = "C:\Users\ahmad\Downloads\Telegram Desktop\Animated and drawed",
  [string]$OutputFolder = "$env:TEMP\optima-animated-emojis-v1"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path -LiteralPath $OutputFolder) {
  Remove-Item -LiteralPath $OutputFolder -Recurse -Force
}
$previewFolder = Join-Path $OutputFolder "previews"
New-Item -ItemType Directory -Path $previewFolder -Force | Out-Null

$zips = @(
  Get-ChildItem -LiteralPath $AnimatedFolder -Filter *.zip -File | Sort-Object Name
  Get-ChildItem -LiteralPath $ItFolder -Filter *.zip -File | Sort-Object Name
)

$manifest = [System.Collections.Generic.List[object]]::new()
$seenSourceIds = [System.Collections.Generic.HashSet[string]]::new()
$packOrdinal = 0

foreach ($zipFile in $zips) {
  $packOrdinal++
  $pack = 100 + $packOrdinal
  $packCode = $packOrdinal.ToString("000")
  $packName = ($zipFile.BaseName -replace '\s*@[^@]+$', '' -replace '\s+by\s*$', '' -replace '\s+', ' ').Trim()
  $archive = [System.IO.Compression.ZipFile]::OpenRead($zipFile.FullName)
  try {
    $groups = $archive.Entries |
      Where-Object { $_.Length -gt 0 -and [System.IO.Path]::GetExtension($_.Name) -in @('.lottie', '.png', '.webp') } |
      Group-Object { $_.FullName.Substring(0, $_.FullName.LastIndexOf('/')) }
    $index = 0

    foreach ($group in $groups) {
      $sourceId = ($group.Name -split '[/\\]')[-1]
      if (-not $sourceId -or -not $seenSourceIds.Add($sourceId)) { continue }
      $lottie = $group.Group | Where-Object { [System.IO.Path]::GetExtension($_.Name) -eq '.lottie' } | Select-Object -First 1
      $png = $group.Group | Where-Object { [System.IO.Path]::GetExtension($_.Name) -eq '.png' } | Select-Object -First 1
      $webp = $group.Group | Where-Object { [System.IO.Path]::GetExtension($_.Name) -eq '.webp' } | Select-Object -First 1
      if ((-not $lottie -and -not $webp) -or (-not $png -and -not $webp)) { continue }

      $index++
      $prefix = if ($lottie) { 'a' } else { 'w' }
      $id = "{0}{1}-{2}" -f $prefix, $packCode, $index.ToString("0000")
      $format = if ($lottie) { 'lottie' } else { 'webp' }
      $assetEntry = if ($lottie) { $lottie } else { $webp }
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($assetEntry, (Join-Path $OutputFolder "$id.$format"), $true)

      $previewExtension = if ($png) { 'png' } else { 'webp' }
      $previewEntry = if ($png) { $png } else { $webp }
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($previewEntry, (Join-Path $previewFolder "$id.$previewExtension"), $true)

      $manifest.Add([ordered]@{
        id = $id
        src = ""
        previewSrc = ""
        pack = $pack
        packName = $packName
        format = $format
      })
    }
  } finally {
    $archive.Dispose()
  }
  Write-Host "$packName`: $index assets"
}

$json = $manifest | ConvertTo-Json -Depth 4 -Compress
[System.IO.File]::WriteAllText((Join-Path $OutputFolder 'manifest.json'), $json, [System.Text.UTF8Encoding]::new($false))
$size = (Get-ChildItem -LiteralPath $OutputFolder -File -Recurse | Measure-Object Length -Sum).Sum
Write-Host "Prepared $($manifest.Count) unique assets ($([math]::Round($size / 1MB, 1)) MB) in $OutputFolder"
