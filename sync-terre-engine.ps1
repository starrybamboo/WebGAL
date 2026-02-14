param(
  [switch]$SkipBuild,
  [switch]$SkipTemplate
)

$ErrorActionPreference = 'Stop'

$webgalRoot = $PSScriptRoot
$terreRoot = Join-Path (Split-Path $webgalRoot -Parent) 'WebGAL_Terre'
$webgalDist = Join-Path $webgalRoot 'packages\webgal\dist'
$terreEngineDist = Join-Path $terreRoot 'packages\terre2\node_modules\webgal-engine\dist'
$terrePackageDir = Join-Path $terreRoot 'packages\terre2'

Write-Host "WebGAL root: $webgalRoot"
Write-Host "Terre root: $terreRoot"

if (-not $SkipBuild) {
  Write-Host 'Building webgal-engine (includes parser)...'
  Push-Location $webgalRoot
  try {
    yarn build
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $webgalDist)) {
  throw "Build output not found: $webgalDist"
}

$terreEngineParent = Split-Path $terreEngineDist -Parent
if (-not (Test-Path $terreEngineParent)) {
  throw "Terre webgal-engine not found: $terreEngineParent"
}

Write-Host 'Syncing dist to Terre node_modules...'
if (Test-Path $terreEngineDist) {
  Remove-Item -Recurse -Force $terreEngineDist
}
Copy-Item -Recurse -Force $webgalDist $terreEngineDist

if (-not $SkipTemplate) {
  Write-Host 'Updating Terre template files...'
  Push-Location $terrePackageDir
  try {
    pnpm update-engine
  } finally {
    Pop-Location
  }
}

Write-Host 'Done.'
