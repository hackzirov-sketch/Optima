$ErrorActionPreference = 'Stop'
$output = Join-Path $PSScriptRoot '../src/data/cefr.json'
$base = 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/'
$sources = @(
  @{ file = 'cefrj-vocabulary-profile-1.5.csv'; source = 'cefrj' },
  @{ file = 'octanove-vocabulary-profile-c1c2-1.0.csv'; source = 'octanove' }
)
$rows = foreach ($source in $sources) {
  $csv = Invoke-RestMethod ($base + $source.file)
  foreach ($row in ($csv | ConvertFrom-Csv)) {
    if ($row.CEFR -notmatch '^[ABC][12]$' -or -not $row.headword) { continue }
    [pscustomobject][ordered]@{ word = $row.headword.Trim(); pos = $row.pos.Trim(); level = $row.CEFR; source = $source.source }
  }
}
$json = ConvertTo-Json -InputObject @($rows) -Depth 3 -Compress
[IO.File]::WriteAllText([IO.Path]::GetFullPath($output), $json, [Text.UTF8Encoding]::new($false))
$rows | Group-Object level | Select-Object Name, Count
