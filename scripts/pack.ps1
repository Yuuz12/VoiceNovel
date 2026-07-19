<#
.SYNOPSIS
  VoiceNovel 发布打包脚本

.DESCRIPTION
  将项目源码打包为 zip 发布包，自动排除敏感配置（data/settings.json 含 API Key）、
  运行时数据（novels/audio_cache/logs）、依赖（node_modules）、Git 历史、IDE 私有目录等。
  打包完成后会自动验证 zip 内容，确保无敏感目录泄漏。

  排除清单：
    .git            Git 历史（可能含历史提交的敏感文件）
    .trae           IDE 私有文档
    .vscode         IDE 私有配置
    .idea           JetBrains IDE 私有配置
    data            运行时数据：settings.json(含API Key) / novels / audio_cache / logs / seg_progress
    node_modules    依赖（应由 npm install 重建）
    .env            真实环境变量（保留 .env.example 模板）
    *.log           日志文件
    *.zip           避免把旧发布包再打进新包

.PARAMETER OutDir
  输出目录，默认为项目根目录的上一级（避免把 zip 生成在项目内被打进自己）。

.PARAMETER OutName
  输出文件名（不含扩展名），默认 VoiceNovel-release。
  可附加版本号，如 -OutName VoiceNovel-v1.0.0

.EXAMPLE
  .\scripts\pack.ps1
  生成 ../VoiceNovel-release.zip

.EXAMPLE
  .\scripts\pack.ps1 -OutDir D:\Releases -OutName VoiceNovel-v1.2.0
  生成 D:\Releases\VoiceNovel-v1.2.0.zip

.NOTES
  接收人使用步骤：
    1. 解压 zip
    2. npm install
    3. npm start
    4. 浏览器打开 http://localhost:3000
    5. 在设置页填入自己的 TTS / LLM API Key
#>
[CmdletBinding()]
param(
  [string]$OutDir = "",
  [string]$OutName = "VoiceNovel-release"
)

$ErrorActionPreference = "Stop"

# 项目根目录（脚本位于 scripts/ 下，根目录是其父目录）
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $root -PathType Container)) {
  Write-Error "无法定位项目根目录：$root"
  exit 1
}

# 默认输出到项目上一级目录，避免 zip 生成在项目内
if (-not $OutDir) {
  $OutDir = Split-Path -Parent $root
}
if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

$zipPath = Join-Path $OutDir "$OutName.zip"

# === 必须排除的顶层项 ===
# 精确名（目录或文件）
$excludeExact = @(
  '.git',
  '.trae',
  '.vscode',
  '.idea',
  'data',
  'node_modules',
  '.env'
)
# 通配名
$excludePatterns = @(
  '*.log',
  '*.zip'
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  VoiceNovel 发布打包" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  源目录: $root"
Write-Host "  输出:   $zipPath"
Write-Host ""

# 过滤顶层项
$excludeSet = @{}
foreach ($n in $excludeExact) { $excludeSet[$n] = $true }

$topItems = Get-ChildItem -Path $root -Force | Where-Object {
  $name = $_.Name
  if ($excludeSet.ContainsKey($name)) { return $false }
  foreach ($pat in $excludePatterns) {
    if ($name -like $pat) { return $false }
  }
  return $true
}

if (-not $topItems -or $topItems.Count -eq 0) {
  Write-Error "未找到任何可打包的顶层项，请检查脚本位置。"
  exit 1
}

Write-Host "包含的顶层项：" -ForegroundColor DarkGray
$topItems | ForEach-Object {
  $tag = if ($_.PSIsContainer) { "[DIR] " } else { "[FILE]" }
  Write-Host "  $tag $($_.Name)" -ForegroundColor DarkGray
}
Write-Host ""

# 删除旧包
if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
  Write-Host "已删除旧包: $zipPath" -ForegroundColor Yellow
}

# 打包
$paths = $topItems | ForEach-Object { $_.FullName }
try {
  Compress-Archive -Path $paths -DestinationPath $zipPath -CompressionLevel Optimal -Force
} catch {
  Write-Error "压缩失败：$($_.Exception.Message)"
  exit 1
}

if (-not (Test-Path $zipPath)) {
  Write-Error "打包失败：zip 文件未生成。"
  exit 1
}

# === 验证 zip 内容，确保无敏感目录 ===
Write-Host ""
Write-Host "正在验证包内容..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$leaked = New-Object System.Collections.Generic.List[string]
$topSeen = New-Object System.Collections.Generic.HashSet[string]
foreach ($entry in $archive.Entries) {
  $top = ($entry.FullName -split '[\\/]')[0]
  [void]$topSeen.Add($top)
  if ($excludeSet.ContainsKey($top)) {
    $leaked.Add($entry.FullName)
  }
}
$archive.Dispose()

if ($leaked.Count -gt 0) {
  Write-Host ""
  Write-Host "验证失败：包内发现敏感内容！" -ForegroundColor Red
  $leaked | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  if ($leaked.Count -gt 10) { Write-Host "  ...（共 $($leaked.Count) 项）" -ForegroundColor Red }
  Remove-Item $zipPath -Force
  Write-Host "已自动删除含敏感内容的 zip。" -ForegroundColor Yellow
  exit 2
}

# 统计
$size = (Get-Item $zipPath).Length
$sizeKB = [math]::Round($size / 1KB, 1)
$sizeMB = [math]::Round($size / 1MB, 2)
$fileCount = $topSeen.Count

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  打包成功" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  文件:     $zipPath"
Write-Host "  大小:     $sizeKB KB ($sizeMB MB)"
Write-Host "  顶层项:   $fileCount 个"
Write-Host ""
Write-Host "接收人使用步骤：" -ForegroundColor Cyan
Write-Host "  1. 解压 zip"
Write-Host "  2. npm install"
Write-Host "  3. npm start"
Write-Host "  4. 浏览器打开 http://localhost:3000"
Write-Host "  5. 在设置页填入自己的 TTS / LLM API Key"
Write-Host ""
