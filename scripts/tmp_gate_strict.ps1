$steps = @(
  @{ Name = 'build'; Cmd = 'npm run build' },
  @{ Name = 'lint'; Cmd = 'npm run lint' },
  @{ Name = 'test'; Cmd = 'npm test' },
  @{ Name = 'smoke:routes'; Cmd = 'npm run smoke:routes' }
)

$failed = $false
$results = @()

foreach ($step in $steps) {
  if ($failed) {
    $results += [PSCustomObject]@{ Step = $step.Name; Status = 'SKIPPED'; ExitCode = -1 }
    Write-Output ("[GATE] {0}: SKIPPED" -f $step.Name)
    continue
  }

  Write-Output ("[GATE] {0}: RUN" -f $step.Name)
  Invoke-Expression $step.Cmd
  $code = $LASTEXITCODE

  if ($code -eq 0) {
    $results += [PSCustomObject]@{ Step = $step.Name; Status = 'PASS'; ExitCode = 0 }
    Write-Output ("[GATE] {0}: PASS (exit 0)" -f $step.Name)
  } else {
    $results += [PSCustomObject]@{ Step = $step.Name; Status = 'FAIL'; ExitCode = $code }
    Write-Output ("[GATE] {0}: FAIL (exit {1})" -f $step.Name, $code)
    $failed = $true
  }
}

Write-Output "[GATE] SUMMARY"
$results | ForEach-Object {
  if ($_.Status -eq 'SKIPPED') {
    Write-Output ("[GATE] - {0}: SKIPPED" -f $_.Step)
  } else {
    Write-Output ("[GATE] - {0}: {1} (exit {2})" -f $_.Step, $_.Status, $_.ExitCode)
  }
}

if ($failed) { exit 1 }
exit 0
