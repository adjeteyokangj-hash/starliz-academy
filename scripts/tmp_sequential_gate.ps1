$ErrorActionPreference = 'Stop'

$steps = @(
  @{ Name = 'build'; Cmd = 'npm run build' },
  @{ Name = 'lint'; Cmd = 'npm run lint' },
  @{ Name = 'test'; Cmd = 'npm test' },
  @{ Name = 'smoke:routes'; Cmd = 'npm run smoke:routes' }
)

foreach ($step in $steps) {
  Write-Output "=== RUN $($step.Name) ==="
  & powershell -NoProfile -ExecutionPolicy Bypass -Command $step.Cmd
  $exitCode = $LASTEXITCODE
  if ($exitCode -eq 0) {
    Write-Output "PASS $($step.Name)"
  } else {
    Write-Output "FAIL $($step.Name) (exit $exitCode)"
    exit $exitCode
  }
}

Write-Output "=== GATE SUMMARY ==="
Write-Output "PASS build"
Write-Output "PASS lint"
Write-Output "PASS test"
Write-Output "PASS smoke:routes"
exit 0
