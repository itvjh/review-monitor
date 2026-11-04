param([ValidateSet('save', 'load')][string]$Action)
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Security
    $vaultDir = Join-Path $env:LOCALAPPDATA 'ReviewMonitor\credentials'
    $vaultFile = Join-Path $vaultDir 'expedia.dpapi'
    $scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    if ($Action -eq 'save') {
        $payload = [Console]::In.ReadToEnd()
        $credential = $payload | ConvertFrom-Json
        if (-not $credential.username -or -not $credential.password) { throw 'Invalid credential' }
        [void][System.IO.Directory]::CreateDirectory($vaultDir)
        $acl = New-Object System.Security.AccessControl.DirectorySecurity
        $acl.SetAccessRuleProtection($true, $false)
        $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
        Set-Acl -LiteralPath $vaultDir -AclObject $acl
        $plain = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $encrypted = [System.Security.Cryptography.ProtectedData]::Protect($plain, $null, $scope)
        [System.IO.File]::WriteAllBytes($vaultFile, $encrypted)
        [Array]::Clear($plain, 0, $plain.Length)
        [Console]::Out.Write('saved')
    } else {
        if (-not [System.IO.File]::Exists($vaultFile)) { [Console]::Out.Write('null'); exit 0 }
        $plain = [System.Security.Cryptography.ProtectedData]::Unprotect([System.IO.File]::ReadAllBytes($vaultFile), $null, $scope)
        [Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($plain))
        [Array]::Clear($plain, 0, $plain.Length)
    }
} catch {
    # Never echo the exception/input: it can contain the credential.
    [Console]::Error.Write('Expedia credential store unavailable.')
    exit 1
}
