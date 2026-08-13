[CmdletBinding()]
param(
    [string]$SourceKeystore = (Join-Path $PSScriptRoot '..\android.keystore'),
    [string]$Alias = 'android',
    [string]$JavaHome = 'C:\Users\medei\.bubblewrap\jdk\jdk-17.0.11+9'
)

$ErrorActionPreference = 'Stop'

$source = [IO.Path]::GetFullPath($SourceKeystore)
$signingDirectory = Join-Path $env:LOCALAPPDATA 'EvolucaoClinica\android-signing'
$destination = Join-Path $signingDirectory 'upload.keystore'
$credentialFile = Join-Path $signingDirectory 'credentials.clixml'
$keytool = Join-Path $JavaHome 'bin\keytool.exe'

if (!(Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Keystore de origem não encontrado: $source"
}
if (!(Test-Path -LiteralPath $keytool -PathType Leaf)) {
    throw "keytool não encontrado: $keytool"
}

$storePassword = Read-Host 'Senha do keystore' -AsSecureString
$keyPassword = Read-Host 'Senha da chave (Enter para usar a mesma senha)' -AsSecureString

$storeCredential = [PSCredential]::new('keystore', $storePassword)
$storePlainText = $storeCredential.GetNetworkCredential().Password
$keyCredential = [PSCredential]::new('key', $keyPassword)
$keyPlainText = $keyCredential.GetNetworkCredential().Password
if ([string]::IsNullOrWhiteSpace($keyPlainText)) {
    $keyPassword = $storePassword
}

try {
    & $keytool -list -keystore $source -storepass $storePlainText -alias $Alias *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'A senha, o alias ou o arquivo de chave não foram validados.'
    }
} finally {
    $storePlainText = $null
    $keyPlainText = $null
}

New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
Copy-Item -LiteralPath $source -Destination $destination -Force

[pscustomobject]@{
    KeystorePath = $destination
    Alias = $Alias
    JavaHome = $JavaHome
    StorePassword = $storePassword
    KeyPassword = $keyPassword
} | Export-Clixml -LiteralPath $credentialFile -Force

& icacls.exe $signingDirectory /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível restringir as permissões de $signingDirectory."
}

Write-Output "Assinatura Android configurada em: $signingDirectory"
Write-Output 'A credencial foi criptografada para este usuário e esta máquina via DPAPI.'
