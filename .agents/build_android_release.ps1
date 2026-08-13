[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$credentialFile = Join-Path $env:LOCALAPPDATA 'EvolucaoClinica\android-signing\credentials.clixml'

if (!(Test-Path -LiteralPath $credentialFile -PathType Leaf)) {
    throw "Configuração de assinatura ausente. Execute primeiro: .\.agents\setup_android_signing.ps1"
}

$signing = Import-Clixml -LiteralPath $credentialFile
if (!(Test-Path -LiteralPath $signing.KeystorePath -PathType Leaf)) {
    throw "Keystore protegido não encontrado: $($signing.KeystorePath)"
}

$storeCredential = [PSCredential]::new('keystore', $signing.StorePassword)
$keyCredential = [PSCredential]::new('key', $signing.KeyPassword)
$previousEnvironment = @{
    JAVA_HOME = $env:JAVA_HOME
    ANDROID_KEYSTORE_PATH = $env:ANDROID_KEYSTORE_PATH
    ANDROID_KEY_ALIAS = $env:ANDROID_KEY_ALIAS
    ANDROID_KEYSTORE_PASSWORD = $env:ANDROID_KEYSTORE_PASSWORD
    ANDROID_KEY_PASSWORD = $env:ANDROID_KEY_PASSWORD
}

try {
    $env:JAVA_HOME = $signing.JavaHome
    $env:ANDROID_KEYSTORE_PATH = $signing.KeystorePath
    $env:ANDROID_KEY_ALIAS = $signing.Alias
    $env:ANDROID_KEYSTORE_PASSWORD = $storeCredential.GetNetworkCredential().Password
    $env:ANDROID_KEY_PASSWORD = $keyCredential.GetNetworkCredential().Password

    Push-Location $projectDirectory
    try {
        node .agents/build_bubblewrap.js
        if ($LASTEXITCODE -ne 0) {
            throw "A geração da release Android terminou com código $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
} finally {
    foreach ($name in $previousEnvironment.Keys) {
        $previousValue = $previousEnvironment[$name]
        if ($null -eq $previousValue) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        } else {
            Set-Item "Env:$name" $previousValue
        }
    }
}
