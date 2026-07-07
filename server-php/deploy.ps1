# DeckGen → hom2box.com/deckGen 배포 (repo 루트에서 실행: .\server-php\deploy.ps1)
# 필요: server/config/google_key.pem, server/config/config.php (git 제외 시크릿)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$remote = "hbox78@hom2box.com"
$webroot = "/var/www/html/deckGen"

Write-Host "[1/6] 클라이언트 빌드" -ForegroundColor Cyan
Push-Location $root
npm run build -w client
Pop-Location

Write-Host "[2/6] SSH 키 준비 (임시 사본 + 권한 잠금)" -ForegroundColor Cyan
$key = "$env:TEMP\deckgen_deploy_key.pem"
Copy-Item "$root\server\config\google_key.pem" $key -Force
icacls $key /inheritance:r | Out-Null
icacls $key /grant:r "$($env:USERNAME):R" | Out-Null

Write-Host "[3/6] 패키징" -ForegroundColor Cyan
$stage = "$env:TEMP\deckgen_stage"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path "$stage\api\src" -Force | Out-Null
Copy-Item "$root\client\dist\*" $stage -Recurse -Force
Copy-Item "$root\server-php\index.php" "$stage\api\" -Force
Copy-Item "$root\server-php\.htaccess" "$stage\api\" -Force
Copy-Item "$root\server-php\src\*" "$stage\api\src\" -Force
Copy-Item "$root\server-php\htaccess-root" "$stage\.htaccess" -Force
# 서버 실설정 = 로컬 시크릿 config.php 그대로 (anthropic_api_key 없으면 모의 모드)
Copy-Item "$root\server\config\config.php" "$stage\api\config.php" -Force
$tar = "$env:TEMP\deckgen_deploy.tgz"
if (Test-Path $tar) { Remove-Item $tar -Force }
tar -czf $tar -C $stage .

Write-Host "[4/6] 업로드 + 전개" -ForegroundColor Cyan
scp -i $key -o StrictHostKeyChecking=accept-new $tar "${remote}:~/deckgen_deploy.tgz"
ssh -i $key $remote "mkdir -p $webroot && tar -xzf ~/deckgen_deploy.tgz -C $webroot && rm ~/deckgen_deploy.tgz && ls $webroot"

Write-Host "[5/6] DB 생성 (없으면)" -ForegroundColor Cyan
$cfg = Get-Content "$root\server\config\config.php" -Raw
$dbPass = [regex]::Match($cfg, "'pass'\s*=>\s*'([^']*)'").Groups[1].Value
$dbUser = [regex]::Match($cfg, "'user'\s*=>\s*'([^']*)'").Groups[1].Value
$dbName = [regex]::Match($cfg, "'db'\s*=>\s*'([^']*)'").Groups[1].Value
ssh -i $key $remote "MYSQL_PWD='$dbPass' mysql -u$dbUser -e 'CREATE DATABASE IF NOT EXISTS $dbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'"

Write-Host "[6/6] 헬스 체크" -ForegroundColor Cyan
icacls $key /grant "$($env:USERNAME):F" | Out-Null  # 읽기 전용으로 잠갔던 임시 키 삭제 권한 복구
Remove-Item $key -Force
Start-Sleep -Seconds 1
$health = Invoke-WebRequest -UseBasicParsing "https://hom2box.com/deckGen/api/health"
Write-Host "health: $($health.StatusCode) $($health.Content)"
Write-Host "완료 → https://hom2box.com/deckGen/" -ForegroundColor Green
