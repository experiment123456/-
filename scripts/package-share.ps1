$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$requiredFiles = @('.gitignore', '.nvmrc', 'package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'tsconfig.app.json', 'vite.config.ts', 'server.mjs', 'auth.mjs', 'relay.mjs', 'README.md', 'TEAM-SETUP.md', 'start-local.cmd')
$includedDirectories = @('src', 'public', 'scripts', 'test-data')
$files = @()
foreach ($relative in $requiredFiles) {
  $files += Get-Item -LiteralPath (Join-Path $projectRoot $relative)
}
foreach ($relative in $includedDirectories) {
  $directory = Join-Path $projectRoot $relative
  $entries = @(Get-ChildItem -LiteralPath $directory -Recurse -Force)
  if ($entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) {
    throw "Refusing to package symbolic links or junctions: $directory"
  }
  $files += $entries | Where-Object { -not $_.PSIsContainer -and $_.Name -notlike '.env*' -and $_.Extension -notin @('.log', '.tmp', '.bak') }
}
$manifestPath = Join-Path $projectRoot 'public\assets\ONLINE-SOURCES.json'
$assetManifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$appSource = Get-Content -LiteralPath (Join-Path $projectRoot 'src\App.tsx') -Raw -Encoding UTF8
foreach ($video in $assetManifest.videos) {
  if (-not $appSource.Contains($video.source)) { throw "Original online video reference missing: $($video.label)" }
}
$offlineCopies = @('public/assets/home-golden-hour.mp4', 'public/assets/home-still-water.mp4', 'public/assets/home-deep-woods.mp4', 'public/assets/home-quiet-dawn.mp4', 'public/assets/train-window.png', 'public/assets/SOURCE-MANIFEST.json', 'scripts/download-share-assets.mjs')
$files = @($files | Where-Object { $relativePath = $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/'); $relativePath -notin $offlineCopies -and -not $relativePath.StartsWith('public/assets/fonts/') })

$releaseDirectory = Join-Path $projectRoot 'release'
[IO.Directory]::CreateDirectory($releaseDirectory) | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 6)
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$archivePath = Join-Path $releaseDirectory "Lumora-Cipher-online-source-v$version-$stamp-$suffix.zip"
$archive = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
$entriesManifest = @()
try {
  foreach ($file in ($files | Sort-Object FullName -Unique)) {
    if (-not $file.FullName.StartsWith("$projectRoot\", [StringComparison]::OrdinalIgnoreCase)) {
      throw "File outside project: $($file.FullName)"
    }
    $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
    $compression = [IO.Compression.CompressionLevel]::Optimal
    if ($file.Extension -in @('.mp4', '.mp3', '.png', '.ttf')) { $compression = [IO.Compression.CompressionLevel]::NoCompression }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, "Lumora-Cipher/$relative", $compression) | Out-Null
    $entriesManifest += [ordered]@{ path = $relative; bytes = $file.Length; sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  }
  $manifest = [ordered]@{
    project = 'Lumora Cipher'
    version = $version
    deliveryMode = 'original-online-assets'
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    excluded = @('.git', 'node_modules', 'dist', 'data', '.env*', 'release', 'logs/caches')
    files = $entriesManifest
  } | ConvertTo-Json -Depth 6
  $entry = $archive.CreateEntry('Lumora-Cipher/SHARE-MANIFEST.json')
  $writer = New-Object IO.StreamWriter($entry.Open(), (New-Object Text.UTF8Encoding($false)))
  try { $writer.WriteLine($manifest) } finally { $writer.Dispose() }
} finally {
  $archive.Dispose()
}
$checksum = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$archivePath.sha256", "$checksum  $([IO.Path]::GetFileName($archivePath))`n", (New-Object Text.UTF8Encoding($false)))
[pscustomobject]@{ Archive = $archivePath; Files = $entriesManifest.Count; SizeMB = [Math]::Round((Get-Item -LiteralPath $archivePath).Length / 1MB, 2); SHA256 = $checksum } | Format-List
