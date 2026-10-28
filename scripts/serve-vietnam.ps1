param(
    [int]$Port = 5556,
    [string]$CloudflaredPath = 'D:\Project-Music\tools\cloudflared.exe'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$config = Join-Path $repo 'config\android.json'
$tunnelLog = Join-Path $repo 'tunnel.log'
$tunnelOut = Join-Path $repo 'tunnel.out.log'

function Sync-Code {
    git -C $repo fetch origin main | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Không lấy được code từ GitHub.' }
    $before = git -C $repo rev-parse HEAD
    git -C $repo pull --ff-only origin main | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Repo có thay đổi cục bộ; không thể tự cập nhật.' }
    $after = git -C $repo rev-parse HEAD
    return ($before -ne $after)
}

function Start-Backend {
    if ($script:backend -and -not $script:backend.HasExited) { Stop-Process -Id $script:backend.Id -Force }
    $script:backend = Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $repo 'server.out.log') -RedirectStandardError (Join-Path $repo 'server.err.log')
    Start-Sleep -Seconds 2
    if ($script:backend.HasExited) { throw 'Máy chủ nhạc không khởi động được. Xem server.err.log.' }
}

try {
    if (-not (Test-Path $CloudflaredPath)) { throw "Không tìm thấy cloudflared: $CloudflaredPath" }
    Set-Location $repo
    $env:PORT = "$Port"
    Sync-Code | Out-Null
    if (-not (Test-Path (Join-Path $repo 'node_modules'))) {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'Cài đặt thư viện thất bại.' }
    }
    Start-Backend
    $script:tunnel = Start-Process -FilePath $CloudflaredPath -ArgumentList @('tunnel','--url',"http://127.0.0.1:$Port",'--no-autoupdate') -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelLog
    $url = $null
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Seconds 1
        $log = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
        if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $url = $Matches[0]; break }
        if ($script:tunnel.HasExited) { throw 'Đường hầm HTTPS không khởi động được.' }
    }
    if (-not $url) { throw 'Không nhận được địa chỉ HTTPS.' }
    $siteUrl = "$url/cinetune/#home"
    $current = (Get-Content $config -Raw | ConvertFrom-Json).siteUrl
    if ($current -ne $siteUrl) {
        @{ siteUrl = $siteUrl } | ConvertTo-Json | Set-Content $config -Encoding utf8
        git -C $repo add config/android.json
        git -C $repo commit -m 'Update Vietnam music server URL' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Không lưu được địa chỉ mới.' }
        git -C $repo push origin main
        if ($LASTEXITCODE -ne 0) { throw 'Không cập nhật được địa chỉ trên GitHub.' }
    }
    Write-Host "CineTune đang chạy: $siteUrl"
    while ($true) {
        Start-Sleep -Seconds 60
        if ($script:tunnel.HasExited) { throw 'Đường hầm HTTPS đã dừng. Chạy lại script để lấy địa chỉ mới.' }
        if ($script:backend.HasExited) { Start-Backend }
        elseif (Sync-Code) {
            npm ci
            if ($LASTEXITCODE -ne 0) { throw 'Cài đặt thư viện mới thất bại.' }
            Start-Backend
        }
    }
} finally {
    if ($script:tunnel -and -not $script:tunnel.HasExited) { Stop-Process -Id $script:tunnel.Id -Force }
    if ($script:backend -and -not $script:backend.HasExited) { Stop-Process -Id $script:backend.Id -Force }
}
