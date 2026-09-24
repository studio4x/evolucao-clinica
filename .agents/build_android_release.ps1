[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$credentialFile = Join-Path $env:LOCALAPPDATA 'EvolucaoClinica\android-signing\credentials.clixml'

function Get-GitValue([string[]]$Arguments) {
    $value = (& git -C $projectDirectory @Arguments 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
        throw "Não foi possível consultar o Git para localizar a raiz canônica do projeto."
    }
    return $value
}

function Get-CanonicalProjectDirectory {
    $gitCommonDirectory = Get-GitValue @('rev-parse', '--git-common-dir')
    if (![IO.Path]::IsPathRooted($gitCommonDirectory)) {
        $gitCommonDirectory = [IO.Path]::GetFullPath((Join-Path $projectDirectory $gitCommonDirectory))
    }

    $canonicalDirectory = [IO.Path]::GetFullPath((Split-Path -Parent $gitCommonDirectory))
    $canonicalGitRoot = (& git -C $canonicalDirectory rev-parse --show-toplevel 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($canonicalGitRoot) -ne $canonicalDirectory) {
        throw "A raiz canônica descoberta pelo Git não é válida: $canonicalDirectory"
    }

    foreach ($requiredPath in @('package.json', 'app', 'twa-manifest.json')) {
        if (!(Test-Path -LiteralPath (Join-Path $canonicalDirectory $requiredPath))) {
            throw "A raiz canônica não contém o arquivo/diretório esperado '$requiredPath': $canonicalDirectory"
        }
    }

    return $canonicalDirectory
}

$canonicalProjectDirectory = Get-CanonicalProjectDirectory

function Get-JavaTool([string]$Name) {
    if ($env:JAVA_HOME) {
        $candidate = Join-Path $env:JAVA_HOME "bin\$Name.exe"
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }
    return $Name
}

function Get-BundleTool {
    if ($env:BUNDLETOOL_JAR -and (Test-Path -LiteralPath $env:BUNDLETOOL_JAR -PathType Leaf)) {
        return [pscustomobject]@{ Type = 'jar'; Path = $env:BUNDLETOOL_JAR }
    }

    $command = Get-Command bundletool -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return [pscustomobject]@{ Type = 'command'; Path = $command.Source }
    }

    return $null
}

function Invoke-BundleTool([object]$Tool, [string[]]$Arguments) {
    if ($Tool.Type -eq 'jar') {
        $output = @(& (Get-JavaTool 'java') -jar $Tool.Path @Arguments 2>&1)
    } else {
        $output = @(& $Tool.Path @Arguments 2>&1)
    }
    if ($LASTEXITCODE -ne 0) {
        throw "bundletool falhou ($($Arguments[0])): $($output -join [Environment]::NewLine)"
    }
    return ($output -join [Environment]::NewLine)
}

function Assert-ReleaseArtifact(
    [string]$ArtifactPath,
    [int]$ExpectedVersionCode,
    [string]$ExpectedVersionName,
    [string]$ExpectedApplicationId,
    [object]$BundleTool
) {
    if (!(Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) {
        throw "Artefato Android não encontrado: $ArtifactPath"
    }

    $signatureOutput = @(& (Get-JavaTool 'jarsigner') -verify $ArtifactPath 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "A assinatura do artefato não foi validada: $ArtifactPath`n$($signatureOutput -join [Environment]::NewLine)"
    }

    if ($null -eq $BundleTool) {
        throw "bundletool não encontrado. Configure BUNDLETOOL_JAR apontando para um bundletool-all antes de entregar um AAB."
    }

    $null = Invoke-BundleTool $BundleTool @('validate', '--bundle', $ArtifactPath)
    $manifest = Invoke-BundleTool $BundleTool @('dump', 'manifest', '--bundle', $ArtifactPath)

    if ($manifest -notmatch 'package="([^"]+)"') {
        throw "Não foi possível ler applicationId dentro do AAB: $ArtifactPath"
    }
    $actualApplicationId = $matches[1]
    if ($actualApplicationId -ne $ExpectedApplicationId) {
        throw "applicationId incorreto no AAB. Esperado '$ExpectedApplicationId', encontrado '$actualApplicationId'."
    }

    if ($manifest -notmatch 'android:versionCode="([0-9]+)"') {
        throw "Não foi possível ler versionCode dentro do AAB: $ArtifactPath"
    }
    $actualVersionCode = [int]$matches[1]
    if ($actualVersionCode -ne $ExpectedVersionCode) {
        throw "versionCode incorreto no AAB. Esperado '$ExpectedVersionCode', encontrado '$actualVersionCode'."
    }

    if ($manifest -notmatch 'android:versionName="([^"]+)"') {
        throw "Não foi possível ler versionName dentro do AAB: $ArtifactPath"
    }
    $actualVersionName = $matches[1]
    if ($actualVersionName -ne $ExpectedVersionName) {
        throw "versionName incorreto no AAB. Esperado '$ExpectedVersionName', encontrado '$actualVersionName'."
    }
}

function Get-Sha256([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToUpperInvariant()
}

function Get-ReleaseVersion {
    $manifestPath = Join-Path $projectDirectory 'twa-manifest.json'
    $versionSourcePath = Join-Path $projectDirectory 'src\components\layout\AppVersion.tsx'
    $gradlePath = Join-Path $projectDirectory 'app\build.gradle'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $versionSource = Get-Content -LiteralPath $versionSourcePath -Raw
    $gradleSource = Get-Content -LiteralPath $gradlePath -Raw
    $code = [int]$manifest.appVersionCode
    $name = [string]$manifest.appVersionName
    $playStoreVersion = "1.0.$code"
    $playStoreFromSource = [regex]::Match($versionSource, 'PLAY_STORE_VERSION\s*=\s*"([^"]+)"').Groups[1].Value
    $gradleCode = [int]([regex]::Match($gradleSource, '\bversionCode\s+(\d+)').Groups[1].Value)
    $gradleName = [regex]::Match($gradleSource, 'versionName\s+"([^"]+)"').Groups[1].Value
    $gradleApplicationId = [regex]::Match($gradleSource, 'applicationId\s+"([^"]+)"').Groups[1].Value
    $applicationId = [string]$manifest.packageId

    if ($code -le 0 -or $name -ne [string]$code -or [string]$manifest.appVersion -ne [string]$code) {
        throw 'twa-manifest.json possui versões inconsistentes.'
    }
    if ($gradleCode -ne $code -or $gradleName -ne [string]$code -or $playStoreFromSource -ne $playStoreVersion) {
        throw "Versões Android inconsistentes. Esperado versionCode $code, versionName $code e PLAY_STORE_VERSION $playStoreVersion."
    }
    if ([string]::IsNullOrWhiteSpace($applicationId) -or $gradleApplicationId -ne $applicationId) {
        throw "applicationId inconsistente entre twa-manifest.json e app/build.gradle."
    }

    return [pscustomobject]@{
        Code = $code
        Name = $name
        PlayStoreVersion = $playStoreVersion
        ApplicationId = $applicationId
    }
}

function Publish-AabArtifact(
    [string]$SourcePath,
    [object]$Version,
    [object]$BundleTool
) {
    $canonicalPath = Join-Path $canonicalProjectDirectory 'app-release-bundle.aab'
    $versionedName = "evolucao-clinica-v$($Version.PlayStoreVersion)-build$($Version.Code).aab"
    $versionedPath = Join-Path $canonicalProjectDirectory $versionedName
    $stagingDirectory = Join-Path $canonicalProjectDirectory ".android-release-staging-$([guid]::NewGuid().ToString('N'))"
    $backupDirectory = Join-Path $canonicalProjectDirectory ".android-release-backup-$([guid]::NewGuid().ToString('N'))"
    $stagedCanonical = Join-Path $stagingDirectory 'app-release-bundle.aab'
    $stagedVersioned = Join-Path $stagingDirectory $versionedName
    $backupCanonical = Join-Path $backupDirectory 'app-release-bundle.aab'
    $backupVersioned = Join-Path $backupDirectory $versionedName
    $canonicalHadBackup = $false
    $versionedHadBackup = $false

    try {
        Assert-ReleaseArtifact $SourcePath $Version.Code $Version.Name $Version.ApplicationId $BundleTool
        New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null
        Copy-Item -LiteralPath $SourcePath -Destination $stagedCanonical
        Copy-Item -LiteralPath $SourcePath -Destination $stagedVersioned
        Assert-ReleaseArtifact $stagedCanonical $Version.Code $Version.Name $Version.ApplicationId $BundleTool
        Assert-ReleaseArtifact $stagedVersioned $Version.Code $Version.Name $Version.ApplicationId $BundleTool
    } catch {
        Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
        throw
    }

    try {
        New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
        if (Test-Path -LiteralPath $canonicalPath -PathType Leaf) {
            Move-Item -LiteralPath $canonicalPath -Destination $backupCanonical
            $canonicalHadBackup = $true
        }
        if (Test-Path -LiteralPath $versionedPath -PathType Leaf) {
            Move-Item -LiteralPath $versionedPath -Destination $backupVersioned
            $versionedHadBackup = $true
        }

        Move-Item -LiteralPath $stagedCanonical -Destination $canonicalPath
        Move-Item -LiteralPath $stagedVersioned -Destination $versionedPath

        Assert-ReleaseArtifact $canonicalPath $Version.Code $Version.Name $Version.ApplicationId $BundleTool
        Assert-ReleaseArtifact $versionedPath $Version.Code $Version.Name $Version.ApplicationId $BundleTool

        $sourceHash = Get-Sha256 $SourcePath
        $canonicalHash = Get-Sha256 $canonicalPath
        $versionedHash = Get-Sha256 $versionedPath
        if ($sourceHash -ne $canonicalHash -or $sourceHash -ne $versionedHash) {
            throw "Hashes SHA-256 divergentes após a entrega do AAB. Origem=$sourceHash, canônico=$canonicalHash, versionado=$versionedHash"
        }

        Remove-Item -LiteralPath $backupDirectory -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "AAB canônico validado: $canonicalPath"
        Write-Host "AAB versionado validado: $versionedPath"
        Write-Host "SHA-256: $sourceHash"
    } catch {
        Remove-Item -LiteralPath $canonicalPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $versionedPath -Force -ErrorAction SilentlyContinue
        if ($canonicalHadBackup) { Move-Item -LiteralPath $backupCanonical -Destination $canonicalPath -Force }
        if ($versionedHadBackup) { Move-Item -LiteralPath $backupVersioned -Destination $versionedPath -Force }
        throw
    } finally {
        Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $backupDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}

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

    $releaseVersion = Get-ReleaseVersion
    $bundleTool = Get-BundleTool
    if ($null -eq $bundleTool) {
        throw 'bundletool não está disponível. O AAB não será entregue sem validação de integridade e metadados internos.'
    }

    Push-Location $projectDirectory
    try {
        node .agents/build_bubblewrap.js
        if ($LASTEXITCODE -ne 0) {
            throw "A geração da release Android terminou com código $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }

    Publish-AabArtifact `
        (Join-Path $projectDirectory 'app\build\outputs\bundle\release\app-release.aab') `
        $releaseVersion `
        $bundleTool
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
