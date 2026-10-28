$ErrorActionPreference='Stop'
$target=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$directory=Join-Path $target 'runtime/cloudflare'
$exe=Join-Path $directory 'cloudflared.exe'
$metadataPath=Join-Path $directory 'process.json'
if(Test-Path -LiteralPath $metadataPath){
 $metadata=Get-Content -LiteralPath $metadataPath -Raw|ConvertFrom-Json
 $existing=Get-Process -Id $metadata.pid -ErrorAction SilentlyContinue
 if($existing){
  if($existing.Path -ne $exe -or [math]::Abs(($existing.StartTime.ToUniversalTime()-([datetimeoffset]$metadata.started).UtcDateTime).TotalSeconds) -gt 3){throw 'O PID do tunel foi reutilizado; nenhum processo sera alterado.'}
  return
 }
}
$token=Join-Path $target 'evidence/private/cloudflare-tunnel.token'
if(-not(Test-Path -LiteralPath $token)){throw 'Conexao privada ainda nao configurada.'}
$p=Start-Process -FilePath $exe -ArgumentList @('tunnel','--no-autoupdate','--protocol','quic','run','--token-file',('"'+$token+'"')) -WorkingDirectory $directory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $directory 'stdout.log') -RedirectStandardError (Join-Path $directory 'stderr.log') -PassThru
[IO.File]::WriteAllText($metadataPath,([pscustomobject]@{pid=$p.Id;started=$p.StartTime.ToUniversalTime().ToString('o')}|ConvertTo-Json),(New-Object Text.UTF8Encoding $false))
