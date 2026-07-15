param(
    [string]$BaseUrl = "http://127.0.0.1:9999/jshERP-boot",
    [Parameter(Mandatory = $true)]
    [string]$Token,
    [Parameter(Mandatory = $true)]
    [long]$CurrentUserId,
    [Parameter(Mandatory = $true)]
    [long]$TargetUserId,
    [long]$CrossTenantUserId = 0,
    [switch]$SkipPasswordChange
)

$ErrorActionPreference = "Stop"

function New-Headers {
    param([string]$TokenValue)
    return @{
        "X-Access-Token" = $TokenValue
        "Content-Type"   = "application/json"
    }
}

function Invoke-Test {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers,
        [object]$Body = $null
    )

    Write-Host ""
    Write-Host "==== $Name ====" -ForegroundColor Cyan
    Write-Host "$Method $Url"

    try {
        if ($null -ne $Body) {
            $json = $Body | ConvertTo-Json -Depth 6
            Write-Host "Request Body: $json"
            $resp = Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -Body $json
        }
        else {
            $resp = Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers
        }
        Write-Host "Result: SUCCESS" -ForegroundColor Green
        $resp | ConvertTo-Json -Depth 8
    }
    catch {
        Write-Host "Result: FAILED/REJECTED" -ForegroundColor Yellow
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $reader.BaseStream.Position = 0
            $reader.DiscardBufferedData()
            $content = $reader.ReadToEnd()
            Write-Host $content
        }
        else {
            Write-Host $_.Exception.Message
        }
    }
}

$headers = New-Headers -TokenValue $Token

Write-Host "BaseUrl       : $BaseUrl"
Write-Host "CurrentUserId : $CurrentUserId"
Write-Host "TargetUserId  : $TargetUserId"
Write-Host "CrossTenantId : $CrossTenantUserId"

Invoke-Test `
    -Name "Get Current Session User" `
    -Method "GET" `
    -Url "$BaseUrl/user/getUserSession" `
    -Headers $headers

Invoke-Test `
    -Name "Try Update Target User Profile" `
    -Method "PUT" `
    -Url "$BaseUrl/user/update" `
    -Headers $headers `
    -Body @{
        id = $TargetUserId
        username = "authz_test_user"
        position = "authz_test_position"
        department = "authz_test_department"
        email = "authz_test@example.com"
        phonenum = "13800000000"
        leaderFlag = "0"
        description = "authz test"
        remark = "authz test"
        tenantId = 999999
        status = 2
        loginName = "should_not_change"
    }

Invoke-Test `
    -Name "Try Reset Target User Password" `
    -Method "POST" `
    -Url "$BaseUrl/user/resetPwd" `
    -Headers $headers `
    -Body @{
        id = $TargetUserId
    }

Invoke-Test `
    -Name "Try Delete Target User" `
    -Method "DELETE" `
    -Url "$BaseUrl/user/delete?id=$TargetUserId" `
    -Headers $headers

Invoke-Test `
    -Name "Try Batch Disable Target User" `
    -Method "POST" `
    -Url "$BaseUrl/user/batchSetStatus" `
    -Headers $headers `
    -Body @{
        status = 2
        ids = "$TargetUserId,"
    }

if ($CrossTenantUserId -gt 0) {
    Invoke-Test `
        -Name "Try Update Cross-Tenant User Profile" `
        -Method "PUT" `
        -Url "$BaseUrl/user/update" `
        -Headers $headers `
        -Body @{
            id = $CrossTenantUserId
            username = "cross_tenant_test"
            position = "cross_tenant_test"
        }
}

if (-not $SkipPasswordChange) {
    Invoke-Test `
        -Name "Try Change Password With Current User Context" `
        -Method "PUT" `
        -Url "$BaseUrl/user/updatePwd" `
        -Headers $headers `
        -Body @{
            userId = $TargetUserId
            oldpassword = "REPLACE_WITH_MD5_OLD_PASSWORD"
            password = "REPLACE_WITH_MD5_NEW_PASSWORD"
        }
}

Write-Host ""
Write-Host "Done. Review success/failure for each case above." -ForegroundColor Cyan
