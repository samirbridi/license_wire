$ErrorActionPreference='Stop'
$playoutRoot=Split-Path $PSScriptRoot -Parent
$sdk=Join-Path $playoutRoot 'binaries/network-sdk'
New-Item -ItemType Directory -Path $sdk -Force | Out-Null
$archive=Join-Path $sdk 'OpenMediaTransport.Binaries.Release.v1.0.0.19.zip'
if(-not(Test-Path -LiteralPath $archive)){
    Invoke-WebRequest -Uri 'https://github.com/openmediatransport/libomtnet/releases/download/v1.0.0.19/OpenMediaTransport.Binaries.Release.v1.0.0.19.zip' -OutFile $archive
}
$actual=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower()
if($actual -ne 'c62460174499dabe703e3e57372daf5f1dd95f890355d11e30052b9ed35bdac4'){throw 'OMT SDK archive hash mismatch'}
$expanded=Join-Path $sdk 'omt-1.0.0.19'
if(-not(Test-Path -LiteralPath $expanded)){Expand-Archive -LiteralPath $archive -DestinationPath $expanded}
Write-Output 'Pinned OMT runtime ready. Build the application to deploy libomt/libvmx and the MIT notice.'
Write-Output 'NDI is loaded dynamically from the official runtime installation; it is not installed or redistributed by this script.'
