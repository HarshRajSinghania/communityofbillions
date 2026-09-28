#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Runs one maintenance pass for communityofbillions.

.DESCRIPTION
    Pulls the repository, hands the maintenance brief to a headless agent, then makes sure
    whatever the agent produced is either committed and pushed, or clearly reported as
    uncommitted and left for a human.

    The runner is deliberately paranoid about one thing: nothing may sit in the working tree
    uncommitted and unnoticed. Everything else it is happy to leave to the agent.

.PARAMETER DryRun
    Compose the prompt and print it, but do not invoke the agent.

.PARAMETER NoPush
    Do not push anything. Useful for a rehearsal.

.EXAMPLE
    pwsh tools/schedule/run-pass.ps1
    pwsh tools/schedule/run-pass.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [switch] $DryRun,
    [switch] $NoPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- paths

$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..' '..')).Path

$LogDir = if ($env:COB_LOG_DIR) {
    $env:COB_LOG_DIR
} else {
    Join-Path (Split-Path -Parent $RepoPath) 'communityofbillions-maintenance\logs'
}

$IndexFile = Join-Path $LogDir 'maintenance.log'
$Stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$PassLog = Join-Path $LogDir "pass-$Stamp.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log {
    param([string] $Message, [string] $Level = 'INFO')
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'), $Level, $Message
    Write-Host $line
    Add-Content -Path $PassLog -Value $line -Encoding utf8
}

function Write-Index {
    param([string] $Message)
    Add-Content -Path $IndexFile -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'), $Message) -Encoding utf8
}

Write-Log "communityofbillions maintenance pass"
Write-Log "repository : $RepoPath"
Write-Log "log        : $PassLog"
Write-Log "agent log  : $LogDir"

# ---------------------------------------------------------------- preflight

Push-Location $RepoPath
try {
    if (-not (Test-Path (Join-Path $RepoPath 'agents/maintenance/pass.md'))) {
        throw "maintenance brief not found at agents/maintenance/pass.md; is this the right repository?"
    }

    $dirtyBefore = git status --porcelain
    if ($dirtyBefore) {
        Write-Log "the working tree was already dirty before this pass:" 'WARN'
        $dirtyBefore | ForEach-Object { Write-Log "  $_" 'WARN' }
    }

    Write-Log 'pulling'
    git pull --rebase --autostash 2>&1 | ForEach-Object { Write-Log "  $_" }

    # ------------------------------------------------------------ prompt

    $brief = Get-Content -Path (Join-Path $RepoPath 'agents/maintenance/pass.md') -Raw

    $header = @"
SCHEDULED MAINTENANCE PASS
Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')
Repository: $RepoPath
Log directory: $LogDir

You are running unattended. There is no human to ask. Read the brief below and carry out
exactly one pass. When a decision is not yours to make, open an issue and stop.

---
"@

    $prompt = $header + $brief

    if ($DryRun) {
        Write-Log 'dry run: the following prompt would be sent'
        Write-Host ''
        Write-Host $prompt
        Write-Host ''
        Write-Log 'dry run complete, nothing was invoked'
        Write-Index "dry-run"
        return
    }

    # ------------------------------------------------------------ run

    $dsh = Get-Command dsh -ErrorAction SilentlyContinue
    if (-not $dsh) {
        Write-Log 'dsh was not found on PATH; cannot run a pass' 'ERROR'
        Write-Index "ERROR dsh not found"
        exit 2
    }

    Write-Log 'invoking the agent (this can take a while)'
    $started = Get-Date
    $agentExit = 0
    try {
        & dsh headless $prompt 2>&1 | Tee-Object -FilePath $PassLog -Append | ForEach-Object { Write-Host $_ }
        $agentExit = $LASTEXITCODE
    } catch {
        Write-Log "the agent invocation failed: $($_.Exception.Message)" 'ERROR'
        $agentExit = 1
    }
    $elapsed = (Get-Date) - $started
    Write-Log ("agent finished with exit code {0} after {1:hh\:mm\:ss}" -f $agentExit, $elapsed)

    # ------------------------------------------------------------ ensure nothing is left behind

    $head = (git rev-parse --short HEAD)
    git push 2>&1 | ForEach-Object { Write-Log "  $_" }
    $headAfterPush = (git rev-parse --short HEAD)

    $dirty = git status --porcelain
    $leftoverCommitted = $false

    if ($dirty) {
        Write-Log 'the agent left uncommitted changes:' 'WARN'
        $dirty | ForEach-Object { Write-Log "  $_" 'WARN' }

        Write-Log 'checking whether the leftover work passes the gates'
        $gatesOk = $true
        $testOutput = & node --test "packages/core/**/*.test.js" 2>&1
        if ($LASTEXITCODE -ne 0) {
            $gatesOk = $false
            $testOutput | Select-Object -Last 40 | ForEach-Object { Write-Log "  $_" 'WARN' }
        }

        if ($gatesOk) {
            Write-Log 'gates pass; committing the leftover work so nothing stays local'
            git add -A
            git commit -m "agents: leftovers from scheduled pass $Stamp" 2>&1 | ForEach-Object { Write-Log "  $_" }
            if (-not $NoPush) {
                git push 2>&1 | ForEach-Object { Write-Log "  $_" }
            }
            $leftoverCommitted = $true
        } else {
            Write-Log 'gates FAIL; leaving the working tree untouched for a human to inspect' 'ERROR'
        }
    }

    # ------------------------------------------------------------ report

    $finalHead = (git rev-parse --short HEAD)
    $log = git log --oneline -1

    Write-Log ''
    Write-Log 'pass summary'
    Write-Log "  agent exit code : $agentExit"
    Write-Log "  head before     : $head"
    Write-Log "  head after      : $finalHead"
    Write-Log "  last commit     : $log"
    Write-Log "  leftovers       : $(if ($dirty) { if ($leftoverCommitted) { 'committed and pushed' } else { 'LEFT DIRTY - human attention needed' } } else { 'none' })"

    Write-Index ("pass complete head={0} agentExit={1} leftovers={2}" -f $finalHead, $agentExit, $(if (-not $dirty) { 'none' } elseif ($leftoverCommitted) { 'committed' } else { 'DIRTY' }))

    exit $agentExit
} finally {
    Pop-Location
}
