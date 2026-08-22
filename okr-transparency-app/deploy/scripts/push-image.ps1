param(
  [Parameter(Mandatory = $true)]
  [string]$Tag,

  [string]$ProjectId = "knowledge-base-496322",
  [string]$Region = "us-west1",
  [string]$Repository = "unitx-internal"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$image = "$Region-docker.pkg.dev/$ProjectId/$Repository/okr-transparency-app:$Tag"

Push-Location $appRoot
try {
  gcloud config set project $ProjectId
  gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet
  docker build --platform linux/amd64 -t $image .
  docker push $image
  Write-Host "Pushed $image"
  Write-Host "NOTE: releases go through docs/RELEASE_CLOUD_RUN.md, which builds with Cloud Build"
  Write-Host "      and deploys a 0-traffic candidate. This script is a local docker build kept"
  Write-Host "      for one-off images; it does not use the Cloud Build dependency cache, and"
  Write-Host "      deploy/terraform has never been applied, so there is no terraform apply step."
} finally {
  Pop-Location
}
