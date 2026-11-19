<#
.SYNOPSIS
  Builds the Loadstone panel, worker and agent images and pushes them to a Docker registry,
  tagged with the project version (from the root package.json) and "latest".

.EXAMPLE
  .\scripts\push-images.ps1
  .\scripts\push-images.ps1 -Login
  .\scripts\push-images.ps1 -Registry registry.example.com/team -Prefix "" -Login
  .\scripts\push-images.ps1 -NoBuild -SkipLatest
  .\scripts\push-images.ps1 -Only agent -DryRun
#>
[CmdletBinding()]
param(
  # Registry namespace: a Docker Hub user/organization (e.g. lisaaqt) or registry.example.com/team.
  [string]$Registry = "lisaaqt",
  # Prefix of the image names: <Registry>/<Prefix>panel, e.g. lisaaqt/loadstone-panel.
  [string]$Prefix = "loadstone-",
  # Target platform of the images (the servers are x86_64).
  [string]$Platform = "linux/amd64",
  # Push the images that are already built locally instead of building them first.
  [switch]$NoBuild,
  # Only push the version tag, not "latest".
  [switch]$SkipLatest,
  # Run "docker login" for the registry host first (prompts for username and password).
  [switch]$Login,
  # Limit to some images, e.g. -Only agent or -Only panel,worker.
  [ValidateSet("panel", "worker", "agent")]
  [string[]]$Only = @("panel", "worker", "agent"),
  # Print the docker commands without running them.
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$version = (Get-Content -Raw -Path (Join-Path $root "package.json") | ConvertFrom-Json).version
if (-not $version -or $version -notmatch '^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$') {
  throw "Could not read a valid version from package.json (got '$version')."
}
$Registry = $Registry.TrimEnd("/")

# name -> Dockerfile and build target (the worker is a stage of the panel Dockerfile).
$images = [ordered]@{
  panel  = @{ Dockerfile = "apps/panel/Dockerfile"; Target = "runner" }
  worker = @{ Dockerfile = "apps/panel/Dockerfile"; Target = "worker" }
  agent  = @{ Dockerfile = "apps/agent/Dockerfile"; Target = $null }
}

function Invoke-Docker([string[]]$Arguments) {
  Write-Host "> docker $($Arguments -join ' ')" -ForegroundColor DarkGray
  if ($DryRun) { return }
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw "docker $($Arguments[0]) failed with exit code $LASTEXITCODE" }
}

if (-not $DryRun) {
  & docker info --format "{{.ServerVersion}}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "Docker is not running. Start Docker Desktop and try again." }
}

Write-Host "Loadstone $version -> $Registry/$($Prefix)(panel|worker|agent) ($Platform)" -ForegroundColor Cyan

if ($Login) {
  # Docker Hub namespaces have no host part ("lisaaqt"); "docker login" without a host logs in to Docker Hub.
  $first = $Registry.Split("/")[0]
  if ($Registry.Contains("/") -and ($first -match "[.:]" -or $first -eq "localhost")) {
    Write-Host "Logging in to $first" -ForegroundColor Cyan
    Invoke-Docker @("login", $first)
  } else {
    Write-Host "Logging in to Docker Hub" -ForegroundColor Cyan
    Invoke-Docker @("login")
  }
}

$pushed = @()
foreach ($name in $images.Keys) {
  if ($Only -notcontains $name) { continue }
  $image = "$Registry/$Prefix$name"
  $tags = @("${image}:$version")
  if (-not $SkipLatest) { $tags += "${image}:latest" }

  if (-not $NoBuild) {
    Write-Host "`nBuilding $name $version" -ForegroundColor Cyan
    $buildArgs = @("buildx", "build", "--platform", $Platform, "-f", $images[$name].Dockerfile)
    if ($images[$name].Target) { $buildArgs += @("--target", $images[$name].Target) }
    foreach ($tag in $tags) { $buildArgs += @("-t", $tag) }
    $buildArgs += @("--load", ".")
    Invoke-Docker $buildArgs
  } elseif (-not $DryRun) {
    & docker image inspect "${image}:$version" *> $null
    if ($LASTEXITCODE -ne 0) {
      # Built earlier under another tag: re-tag the latest local build with the version.
      & docker image inspect "${image}:latest" *> $null
      if ($LASTEXITCODE -ne 0) { throw "No local image ${image}:$version or ${image}:latest. Run without -NoBuild." }
      Invoke-Docker @("tag", "${image}:latest", "${image}:$version")
    }
  }

  Write-Host "Pushing $name" -ForegroundColor Cyan
  foreach ($tag in $tags) {
    Invoke-Docker @("push", $tag)
    $pushed += $tag
  }
}

Write-Host "`nDone. Pushed:" -ForegroundColor Green
$pushed | ForEach-Object { Write-Host "  $_" }
