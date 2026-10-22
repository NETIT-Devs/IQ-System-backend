$ErrorActionPreference = "Stop"

$fullName = Read-Host "Super Admin full name"
$email = (Read-Host "Super Admin email").Trim().ToLower()
$securePassword = Read-Host "Create password (hidden)" -AsSecureString

$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

    if ([string]::IsNullOrWhiteSpace($fullName) -or
        [string]::IsNullOrWhiteSpace($email) -or
        $password.Length -lt 12) {
        throw "Name and email are required. Password must contain at least 12 characters."
    }

    $env:SUPERADMIN_NAME = $fullName
    $env:SUPERADMIN_EMAIL = $email
    $env:SUPERADMIN_PASSWORD = $password

    node createSuperAdminFromEnv.js

    if ($LASTEXITCODE -ne 0) {
        throw "Account creation failed. Check the error above."
    }
}
finally {
    $password = $null
    $securePassword.Dispose()
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    Remove-Item Env:SUPERADMIN_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:SUPERADMIN_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:SUPERADMIN_PASSWORD -ErrorAction SilentlyContinue
}