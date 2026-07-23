$nodePath = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (-not (Test-Path $nodePath)) {
  Write-Error "Codex bundled Node.js was not found at $nodePath"
  exit 1
}

& $nodePath "node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5173
