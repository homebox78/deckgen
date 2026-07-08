# Street Chalkboard deploy -> hom2box.com/chalk  (+ shared PHP /st routes)
# Run from repo root: .\chalkboard\deploy.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$remote = "hbox78@hom2box.com"
$chalkRoot = "/var/www/html/chalk"
$apiRoot = "/var/www/html/deckGen/api"

Write-Host "[1/5] build chalkboard client" -ForegroundColor Cyan
Push-Location $PSScriptRoot
$ErrorActionPreference = "Continue"
cmd /c "npm run build"
$buildExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
Pop-Location
if ($buildExit -ne 0) { throw "chalkboard build failed (exit $buildExit)" }

Write-Host "[2/5] ssh key prep" -ForegroundColor Cyan
$key = "$env:TEMP\chalk_deploy_key.pem"
Copy-Item "$root\server\config\google_key.pem" $key -Force
icacls $key /inheritance:r | Out-Null
icacls $key /grant:r "$($env:USERNAME):R" | Out-Null

Write-Host "[3/5] package" -ForegroundColor Cyan
$stage = "$env:TEMP\chalk_stage"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path "$stage\api\src" -Force | Out-Null
Copy-Item "$PSScriptRoot\dist\*" $stage -Recurse -Force
Copy-Item "$PSScriptRoot\htaccess-root" "$stage\.htaccess" -Force
# shared PHP: only the files that changed for /st routes (index.php + Street.php)
Copy-Item "$root\server-php\index.php" "$stage\api\index.php" -Force
Copy-Item "$root\server-php\src\Street.php" "$stage\api\src\Street.php" -Force

$tar = "$env:TEMP\chalk_deploy.tgz"
if (Test-Path $tar) { Remove-Item $tar -Force }
tar -czf $tar -C $stage .

Write-Host "[4/5] upload + lint-gate + extract" -ForegroundColor Cyan
scp -i $key -o StrictHostKeyChecking=accept-new $tar "${remote}:~/chalk_deploy.tgz"
# Unpack to temp, LINT the shared PHP first (a parse error must NOT reach live index.php / DeckGen),
# then copy: api/* -> deckGen/api only if lint passes; chalk client -> chalkRoot always.
$remoteCmd = @'
set -e
rm -rf ~/chalk_unpack && mkdir -p ~/chalk_unpack
tar -xzf ~/chalk_deploy.tgz -C ~/chalk_unpack
echo "--- php -l ---"
php -l ~/chalk_unpack/api/src/Street.php
php -l ~/chalk_unpack/api/index.php
echo "--- lint ok, copying ---"
mkdir -p CHALKROOT APIROOT/src
cp ~/chalk_unpack/api/index.php APIROOT/index.php
cp ~/chalk_unpack/api/src/Street.php APIROOT/src/Street.php
rm -rf ~/chalk_unpack/api
cp -r ~/chalk_unpack/. CHALKROOT/
rm -rf ~/chalk_unpack ~/chalk_deploy.tgz
ls CHALKROOT
'@
$remoteCmd = $remoteCmd.Replace("CHALKROOT", $chalkRoot).Replace("APIROOT", $apiRoot) -replace "`r`n", "`n"
ssh -i $key $remote $remoteCmd

Write-Host "[5/5] health check" -ForegroundColor Cyan
icacls $key /grant "$($env:USERNAME):F" | Out-Null
Remove-Item $key -Force
Start-Sleep -Seconds 1
try {
  $h = Invoke-WebRequest -UseBasicParsing "https://hom2box.com/deckGen/api/health"
  Write-Host "api health: $($h.StatusCode)"
} catch { Write-Host "api health FAILED" }
try {
  $c = Invoke-WebRequest -UseBasicParsing "https://hom2box.com/chalk/"
  Write-Host "chalk index: $($c.StatusCode)"
} catch { Write-Host "chalk index FAILED" }
Write-Host "done -> https://hom2box.com/chalk/" -ForegroundColor Green
