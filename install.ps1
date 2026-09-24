# OpenFlow bootstrap for Windows (PowerShell 5.1+).
#   irm https://raw.githubusercontent.com/Vasiniks/OpenFlow/main/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Vasiniks/OpenFlow/main/install.ps1))) --only opencode
# Ensures git, Node.js 20+ and uv (via winget / uv's installer), clones/updates OpenFlow into ~\.openflow,
# adds an `openflow` command, runs install.
$ErrorActionPreference = 'Stop'
$Repo = if ($env:OPENFLOW_REPO) { $env:OPENFLOW_REPO } else { 'https://github.com/Vasiniks/OpenFlow.git' }
$Dir  = if ($env:OPENFLOW_HOME) { $env:OPENFLOW_HOME } else { Join-Path $HOME '.openflow' }
function Have($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Update-SessionPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Install-Winget($id) {
  if (-not (Have winget)) { throw "winget not found: install $id manually, then re-run." }
  winget install --id $id -e --silent --accept-source-agreements --accept-package-agreements
  Update-SessionPath
}

Write-Host "== OpenFlow bootstrap" -ForegroundColor Cyan
if (-not (Have git)) { Install-Winget 'Git.Git' }   # also provides Git Bash, which OpenCode's shell tool uses
$nodeOk = $false
if (Have node) { $nodeOk = [int](node -p "process.versions.node.split('.')[0]") -ge 20 }
if (-not $nodeOk) { Install-Winget 'OpenJS.NodeJS.LTS' }
if (-not (Have uv)) {
  powershell -NoProfile -ExecutionPolicy ByPass -Command "irm https://astral.sh/uv/install.ps1 | iex"
  Update-SessionPath
  $env:Path = (Join-Path $HOME '.local\bin') + ';' + $env:Path
}

if (Test-Path (Join-Path $Dir '.git')) {
  git -C $Dir pull --ff-only -q
} elseif (Test-Path $Dir) {   # an earlier install left caches/backups here: adopt the folder instead of cloning into it
  git -C $Dir init -q; git -C $Dir remote add origin $Repo; git -C $Dir fetch -q --depth 1 origin main
  git -C $Dir checkout -q -f -B main FETCH_HEAD; git -C $Dir branch -q -u origin/main
} else {
  git clone -q --depth 1 $Repo $Dir
}

$bin = Join-Path $HOME '.local\bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
Set-Content -Path (Join-Path $bin 'openflow.cmd') -Value "@node `"$Dir\openflow.mjs`" %*" -Encoding ASCII

node (Join-Path $Dir 'openflow.mjs') install @args
exit $LASTEXITCODE
