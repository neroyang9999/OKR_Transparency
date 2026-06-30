param(
  [Parameter(Mandatory = $true)]
  [string]$Tag,

  [string]$ProjectId = "gen-lang-client-0913302758",
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
  Write-Host "Set image_tag = `"$Tag`" in deploy/terraform/terraform.tfvars, then run terraform apply."
} finally {
  Pop-Location
}
