# team-status.ps1 - live status of novel-team workflow agents: who's working, time + tokens per agent
# Usage: powershell -File tools\team-status.ps1            (latest run, auto-detect)
#        powershell -File tools\team-status.ps1 -RunDir <path to wf_* dir>
param(
    [string]$RunDir = ""
)

if (-not $RunDir) {
    $RunDir = Get-ChildItem "C:\Users\Admin\.claude\projects\d--test-my-novel\*\subagents\workflows\wf_*" -Directory -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $RunDir -or -not (Test-Path $RunDir)) { Write-Host "no workflow run dir found"; exit 1 }

Write-Host "Run: $(Split-Path $RunDir -Leaf)" -ForegroundColor Cyan
$now = Get-Date
$rows = foreach ($f in (Get-ChildItem $RunDir -Filter agent-*.jsonl | Sort-Object LastWriteTime)) {
    $first = $null; $last = $null; $out = 0; $role = "?"
    foreach ($l in (Get-Content $f.FullName -Encoding utf8)) {
        try { $o = $l | ConvertFrom-Json } catch { continue }
        if ($o.timestamp) { if (-not $first) { $first = $o.timestamp }; $last = $o.timestamp }
        if ($o.type -eq 'user' -and $role -eq '?') {
            $c = $o.message.content
            $txt = if ($c -is [string]) { $c } elseif ($c -is [array]) { ($c | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join ' ' } else { '' }
            $m = [regex]::Match($txt, '(?<=คุณคือ\s*"?)[^"\r\n(]{2,40}')
            if ($m.Success) { $role = $m.Value.Trim() }
        }
        if ($o.type -eq 'assistant' -and $o.message.usage) { $out += [int]$o.message.usage.output_tokens }
    }
    $ageSec = ($now - $f.LastWriteTime).TotalSeconds
    $status = if ($ageSec -lt 90) { "RUNNING" } else { "done" }
    $min = if ($first -and $last) { [math]::Round((([datetime]$last) - ([datetime]$first)).TotalMinutes, 1) } else { 0 }
    [pscustomobject]@{ status = $status; role = $role; min = $min; out_tokens = $out; last_update = $f.LastWriteTime.ToString("HH:mm:ss") }
}
$rows = @($rows)
$rows | Format-Table -AutoSize
$running = @($rows | Where-Object { $_.status -eq "RUNNING" })
Write-Host ("TOTAL: {0} agents - output {1:N0} tokens - now running: {2}" -f $rows.Count, ($rows | Measure-Object out_tokens -Sum).Sum, $(if ($running) { ($running.role -join ', ') } else { "none (finished/idle)" }))
