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

function Resolve-DshCommand {
    <#
        Locate the dsh launcher.

        This deliberately does NOT just call `Get-Command dsh`.

        A `dsh` started through `npx` puts its own shim directory on PATH **for its children
        only**. A task started by Windows Task Scheduler inherits the logon session's PATH,
        which does not contain the npx cache. An earlier version of this script relied on
        `Get-Command` alone and would have failed with "dsh not found" on the very first
        unattended run — after reporting that everything was ready.

        Search order, most explicit first:
          1. $env:COB_DSH                       — operator override
          2. <log dir>\dsh-path.txt             — what the last successful run used
          3. PATH
          4. npm global prefix, %APPDATA%\npm   — a real install, if there is one
          5. the npx cache, newest first        — works, but volatile: npm may prune it
    #>
    if ($env:COB_DSH) {
        if (-not (Test-Path -LiteralPath $env:COB_DSH)) {
            throw "COB_DSH is set to '$env:COB_DSH', which does not exist."
        }
        return $env:COB_DSH
    }

    $pinnedFile = Join-Path $LogDir 'dsh-path.txt'
    if (Test-Path -LiteralPath $pinnedFile) {
        $pinned = Get-Content -LiteralPath $pinnedFile -Raw -ErrorAction SilentlyContinue
        if ($pinned) {
            $pinned = $pinned.Trim()
            if ($pinned -and (Test-Path -LiteralPath $pinned)) { return $pinned }
        }
    }

    $onPath = Get-Command dsh -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }

    $prefix = $null
    try { $prefix = (npm config get prefix 2>$null | Select-Object -First 1) } catch { }

    $candidates = @()
    if ($env:APPDATA) { $candidates += (Join-Path $env:APPDATA 'npm\dsh.cmd') }
    if ($prefix) { $candidates += (Join-Path $prefix 'dsh.cmd') }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }

    if ($env:LOCALAPPDATA) {
        $pattern = Join-Path $env:LOCALAPPDATA 'npm-cache\_npx\*\node_modules\.bin\dsh.ps1'
        $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending
        if ($found) { return $found[0].FullName }
    }

    return $null
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

    # ------------------------------------------------------------ locate the agent

    # Resolved before the dry-run branch so that a dry run actually proves the thing most
    # likely to be broken in an unattended context.
    $dshPath = Resolve-DshCommand
    if (-not $dshPath) {
        Write-Log 'could not find the dsh launcher in any known location.' 'ERROR'
        Write-Log '  set $env:COB_DSH to its full path, or install it globally:' 'ERROR'
        Write-Log '    npm install -g @deepseek-ai/dsh' 'ERROR'
        Write-Index 'ERROR dsh not found'
        exit 2
    }
    Write-Log "agent      : $dshPath"

    # Remember it, so the next run is deterministic even if PATH changes.
    Set-Content -Path (Join-Path $LogDir 'dsh-path.txt') -Value $dshPath -Encoding utf8 -NoNewline

    if ($dshPath -match '_npx') {
        Write-Log 'note: this is an npx-cached copy. Working, but npm may prune it.' 'WARN'
        Write-Log '      To make it permanent: npm install -g @deepseek-ai/dsh' 'WARN'
    }

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

    Write-Log 'invoking the agent (this can take a while)'
    $started = Get-Date
    $agentExit = 0
    try {
        & $dshPath headless $prompt 2>&1 | Tee-Object -FilePath $PassLog -Append | ForEach-Object { Write-Host $_ }
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
