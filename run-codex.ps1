<#
.SYNOPSIS
    Run OpenAI Codex CLI non-interactively as a subagent and return structured results.

.DESCRIPTION
    Wraps `codex exec` so an orchestrator agent (e.g. DSH) can delegate work to Codex.

    Design notes (all verified on this machine):
      * Prefers the standalone CLI package (stable release, junction -> releases\<ver>,
        survives desktop-client upgrades) and falls back to the MSIX-bundled copy.
      * The prompt is always piped through stdin as UTF-8 bytes. Passing non-ASCII text
        as an argv element gets mangled by the Windows ANSI code page.
      * Results are read from the `--json` JSONL event stream, never from raw stdout,
        because PowerShell's pipeline re-encodes the child's output as GBK.
      * `codex exec resume` accepts neither -C, -s nor --ephemeral, and must run with
        the *same* working directory as the original session, so resume mode sets
        ProcessStartInfo.WorkingDirectory instead of passing -C.

.PARAMETER Prompt
    Task text. If omitted (or '-'), read from stdin.

.PARAMETER Dir
    Working root for the Codex agent. Defaults to the current directory.

.PARAMETER Sandbox
    read-only | workspace-write | danger-full-access. Defaults to read-only.
    Ignored when -Resume is used (resume rejects -s).

.PARAMETER Resume
    Thread id from a previous run (the ThreadId this script returns).
    Re-uses that session's conversation history.

.PARAMETER Model
    Override the model configured in ~/.codex/config.toml.

.PARAMETER OutputSchema
    Path to a JSON Schema file; forces the final message to match it.

.PARAMETER Ephemeral
    Do not persist the session to disk. Faster and leaves no rollout behind, but the
    resulting ThreadId CANNOT be resumed later -- use it for throwaway one-shot work only.

.PARAMETER TimeoutSec
    Hard wall-clock limit. Defaults to 900. On expiry the whole process tree is killed.

.PARAMETER LastMessageFile
    Also write the final agent message to this path.

.PARAMETER LogDir
    Where to keep the raw JSONL event log. Defaults to %TEMP%\codex-runs.

.PARAMETER Quiet
    Suppress the human-readable summary; only return the object.

.PARAMETER DryRun
    Print the resolved executable and argument list, then exit.

.EXAMPLE
    .\run-codex.ps1 -Prompt "Summarize README.md in 5 lines" -Sandbox read-only

.EXAMPLE
    .\run-codex.ps1 -Prompt "Now refactor it" -Resume 01a2107a-2bed-77b0-8c59-86ebf96835d5

.OUTPUTS
    PSCustomObject: ExitCode, TimedOut, ThreadId, Text, Usage, Commands, Resumed,
    CodexPath, CodexVersion, LogPath, DurationSec, Stderr
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0, ValueFromPipeline = $true)]
    [string]$Prompt,

    [string]$Dir = (Get-Location).ProviderPath,
    [ValidateSet('read-only', 'workspace-write', 'danger-full-access')]
    [string]$Sandbox = 'read-only',
    [string]$Resume,
    [string]$Model,
    [string]$OutputSchema,
    [int]$TimeoutSec = 900,
    [string]$LastMessageFile,
    [string]$LogDir = (Join-Path $env:TEMP 'codex-runs'),
    [string]$Effort,
    [switch]$Ephemeral,
    [switch]$Quiet,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ---------------------------------------------------------------- helpers

function Get-CodexPath {
    <# Standalone package first, then PATH, then newest MSIX-bundled copy. #>
    $candidates = [System.Collections.Generic.List[string]]::new()

    $standaloneRoot = Join-Path $env:USERPROFILE '.codex\packages\standalone'
    $current = Join-Path $standaloneRoot 'current\bin\codex.exe'
    if (Test-Path -LiteralPath $current) { $candidates.Add($current) }

    # If the junction is missing or broken, pick the newest release directly.
    $releases = Join-Path $standaloneRoot 'releases'
    if (Test-Path -LiteralPath $releases) {
        Get-ChildItem -LiteralPath $releases -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object {
                $exe = Join-Path $_.FullName 'bin\codex.exe'
                if (Test-Path -LiteralPath $exe) { $candidates.Add($exe) }
            }
    }

    $onPath = Get-Command codex -ErrorAction SilentlyContinue
    if ($onPath -and $onPath.Source -and (Test-Path -LiteralPath $onPath.Source)) {
        $candidates.Add($onPath.Source)
    }

    # Last resort: the CLI shipped inside the desktop client's MSIX payload.
    Get-ChildItem 'C:\Program Files\WindowsApps' -Filter 'OpenAI.Codex_*_x64__*' -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object {
            $exe = Join-Path $_.FullName 'app\resources\codex.exe'
            if (Test-Path -LiteralPath $exe) { $candidates.Add($exe) }
        }

    $seen = @{}
    foreach ($c in $candidates) {
        $full = [System.IO.Path]::GetFullPath($c)
        if (-not $seen.ContainsKey($full)) {
            $seen[$full] = $true
            return $full
        }
    }
    throw 'No codex executable found (standalone package, PATH, and MSIX payload all missing).'
}

function ConvertTo-ArgString {
    <# Quote argv per the MSVC C runtime rules (list2cmdline). #>
    param([string[]]$Arguments)

    $parts = foreach ($a in $Arguments) {
        if ($null -eq $a) { '""'; continue }
        if ($a -ne '' -and $a -notmatch '[\s"]') { $a; continue }

        $sb = [System.Text.StringBuilder]::new()
        [void]$sb.Append('"')
        $backslashes = 0
        foreach ($ch in $a.ToCharArray()) {
            if ($ch -eq '\') {
                $backslashes++
            }
            elseif ($ch -eq '"') {
                [void]$sb.Append('\' * ($backslashes * 2 + 1))
                [void]$sb.Append('"')
                $backslashes = 0
            }
            else {
                [void]$sb.Append('\' * $backslashes)
                [void]$sb.Append($ch)
                $backslashes = 0
            }
        }
        [void]$sb.Append('\' * ($backslashes * 2))
        [void]$sb.Append('"')
        $sb.ToString()
    }
    $parts -join ' '
}

function Test-ProviderReachable {
    <# The `custom` provider in config.toml points at a local proxy; warn if it is down. #>
    param([string]$CodexPath)

    $cfg = Join-Path $env:USERPROFILE '.codex\config.toml'
    if (-not (Test-Path -LiteralPath $cfg)) { return }
    try {
        $text = Get-Content -LiteralPath $cfg -Raw -Encoding UTF8
        $m = [regex]::Match($text, 'base_url\s*=\s*"http://(?:127\.0\.0\.1|localhost):(\d+)')
        if (-not $m.Success) { return }
        $port = [int]$m.Groups[1].Value
        $client = [System.Net.Sockets.TcpClient]::new()
        try {
            $connected = $client.ConnectAsync('127.0.0.1', $port).Wait(700)
            if (-not $connected -or -not $client.Connected) {
                Write-Warning "No listener on 127.0.0.1:$port (the model provider proxy from ~/.codex/config.toml). Codex will likely fail; start that proxy first."
            }
        }
        finally { $client.Dispose() }
    }
    catch { }   # advisory check only, never fatal
}

# ---------------------------------------------------------------- resolve

$codexPath = Get-CodexPath
$codexVersion = (& $codexPath --version 2>&1 | Out-String).Trim()

if (-not (Test-Path -LiteralPath $Dir)) { throw "Working directory not found: $Dir" }
$Dir = (Resolve-Path -LiteralPath $Dir).ProviderPath

$resuming = [bool]$Resume

# ---------------------------------------------------------------- prompt

if ($PSBoundParameters.ContainsKey('Prompt') -and $Prompt -and $Prompt -ne '-') {
    $promptText = $Prompt
}
elseif ($MyInvocation.ExpectingInput -or -not [Console]::IsInputRedirected) {
    $promptText = @($input) -join "`n"
}
else {
    $promptText = [Console]::In.ReadToEnd()
}
if (-not $promptText -or -not $promptText.Trim()) {
    throw 'Empty prompt. Pass -Prompt "..." or pipe text in.'
}

# ---------------------------------------------------------------- argv

$argv = [System.Collections.Generic.List[string]]::new()
[void]$argv.Add('exec')

if ($resuming) {
    [void]$argv.Add('resume')
    [void]$argv.Add($Resume)
    # `exec resume` has no -s/--sandbox flag (verified via `codex exec resume --help`).
    # Without it the sandbox falls back to read-only, so file writes silently fail.
    # Override through config instead, which resume does accept.
    [void]$argv.Add('-c'); [void]$argv.Add("sandbox_mode=`"$Sandbox`"")
}
else {
    [void]$argv.Add('-C'); [void]$argv.Add($Dir)
    # --ephemeral is opt-in: it prevents the session rollout from being saved, which
    # makes a later `exec resume <thread_id>` fail with "no rollout found".
    if ($Ephemeral) { [void]$argv.Add('--ephemeral') }
    [void]$argv.Add('-s'); [void]$argv.Add($Sandbox)
}

[void]$argv.Add('--skip-git-repo-check')
[void]$argv.Add('--json')
if ($Model) { [void]$argv.Add('-m'); [void]$argv.Add($Model) }
if ($Effort) { [void]$argv.Add('-c'); [void]$argv.Add("model_reasoning_effort=`"$Effort`"") }
if ($OutputSchema) {
    if (-not (Test-Path -LiteralPath $OutputSchema)) { throw "Output schema not found: $OutputSchema" }
    [void]$argv.Add('--output-schema'); [void]$argv.Add((Resolve-Path -LiteralPath $OutputSchema).ProviderPath)
}
[void]$argv.Add('-')

$argString = ConvertTo-ArgString $argv.ToArray()

if ($DryRun) {
    [pscustomobject]@{
        CodexPath    = $codexPath
        CodexVersion = $codexVersion
        WorkingDir   = $Dir
        Arguments    = $argString
        Resuming     = $resuming
        PromptChars  = $promptText.Length
    }
    return
}

Test-ProviderReachable -CodexPath $codexPath

# ---------------------------------------------------------------- launch

if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $LogDir ("{0}-{1}.jsonl" -f $stamp, ([guid]::NewGuid().ToString('N').Substring(0, 8)))

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $codexPath
$psi.Arguments = $argString
$psi.WorkingDirectory = $Dir          # resume must inherit the original session's cwd
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$utf8 = New-Object System.Text.UTF8Encoding $false
$psi.StandardOutputEncoding = $utf8
$psi.StandardErrorEncoding = $utf8

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$proc = [System.Diagnostics.Process]::Start($psi)

# UTF-8 bytes straight into the child's stdin stream: no console code page involved.
$promptBytes = [System.Text.Encoding]::UTF8.GetBytes($promptText)
$proc.StandardInput.BaseStream.Write($promptBytes, 0, $promptBytes.Length)
$proc.StandardInput.BaseStream.Flush()
$proc.StandardInput.Close()

$stdoutTask = $proc.StandardOutput.ReadToEndAsync()
$stderrTask = $proc.StandardError.ReadToEndAsync()

$timedOut = $false
if (-not $proc.WaitForExit($TimeoutSec * 1000)) {
    $timedOut = $true
    # /T kills the whole tree: Codex may have spawned shell/python children.
    & taskkill.exe /T /F /PID $proc.Id 2>&1 | Out-Null
    [void]$proc.WaitForExit(5000)
}
$sw.Stop()

$stdout = $stdoutTask.Result
$stderr = $stderrTask.Result

try { $utf8NoBom = New-Object System.Text.UTF8Encoding $false
      [System.IO.File]::WriteAllText($logPath, $stdout, $utf8NoBom) } catch { }

# ---------------------------------------------------------------- parse

$threadId = $null
$usage = $null
$text = $null
$commands = [System.Collections.Generic.List[object]]::new()
$errors = [System.Collections.Generic.List[string]]::new()

foreach ($line in ($stdout -split "`r?`n")) {
    if (-not $line.Trim()) { continue }
    try { $evt = $line | ConvertFrom-Json } catch { continue }

    switch ($evt.type) {
        'thread.started' { $threadId = $evt.thread_id }
        'turn.completed' { $usage = $evt.usage }
        'error'          { $errors.Add([string]$evt.message) }
        'item.completed' {
            $item = $evt.item
            if (-not $item) { break }
            switch ($item.type) {
                'agent_message'       { $text = $item.text }
                'command_execution'   {
                    $commands.Add([pscustomobject]@{
                        Command  = $item.command
                        ExitCode = $item.exit_code
                        Output   = $item.aggregated_output
                    })
                }
                'file_change'         {
                    $commands.Add([pscustomobject]@{
                        Command  = 'file_change'
                        ExitCode = $null
                        Output   = $item.changes
                    })
                }
            }
        }
    }
}

if (-not $text) {
    # Non-JSON output (older builds / hard failure): keep whatever the agent last said.
    $text = ($stdout -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
}
if ($errors.Count) { $stderr = (($errors -join "`n") + "`n" + $stderr).Trim() }

if ($LastMessageFile) {
    $parent = Split-Path -Parent $LastMessageFile
    if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    [System.IO.File]::WriteAllText($LastMessageFile, $text, $utf8)
}

$result = [pscustomobject]@{
    ExitCode     = $proc.ExitCode
    TimedOut     = $timedOut
    ThreadId     = $threadId
    Text         = $text
    Usage        = $usage
    Commands     = $commands.ToArray()
    Errors       = $errors.ToArray()
    Resumed      = $resuming
    Resumable    = (-not $resuming) -and (-not $Ephemeral) -and ($null -ne $threadId)
    Sandbox      = if ($resuming) { '(inherited)' } else { $Sandbox }
    CodexPath    = $codexPath
    CodexVersion = $codexVersion
    DurationSec  = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    LogPath      = $logPath
    Stderr       = $stderr.Trim()
}

# ---------------------------------------------------------------- report

if (-not $Quiet) {
    $status = if ($timedOut) { 'TIMEOUT' } elseif ($proc.ExitCode -ne 0) { "FAILED (exit $($proc.ExitCode))" } else { 'OK' }
    Write-Host "== Codex $status ==" -ForegroundColor $(if ($timedOut -or $proc.ExitCode -ne 0) { 'Red' } else { 'Green' })
    Write-Host ("   cli   : {0} ({1})" -f $codexVersion, (Split-Path -Leaf (Split-Path -Parent (Split-Path -Parent $codexPath))))
    Write-Host ("   thread: {0}" -f $threadId)
    Write-Host ("   sand  : {0}   {1:N1}s" -f $result.Sandbox, $result.DurationSec)
    if ($usage) {
        Write-Host ("   tokens: in={0} cached={1} out={2}" -f $usage.input_tokens, $usage.cached_input_tokens, $usage.output_tokens)
    }
    Write-Host ("   cmds  : {0}   log: {1}" -f $commands.Count, $logPath)
    if ($result.Resumable) {
        Write-Host ("   resume: .\run-codex.ps1 -Resume {0} -Prompt `"...`"" -f $threadId) -ForegroundColor DarkGray
    }
    elseif (-not $resuming -and $Ephemeral) {
        Write-Host '   resume: unavailable (--ephemeral does not persist the session)' -ForegroundColor DarkGray
    }
    if ($result.Stderr) { Write-Host ("   stderr: " + $result.Stderr) -ForegroundColor Yellow }
}

$result
