param(
    [string]$Path = '.'
)

$ErrorActionPreference = 'Stop'

function Get-Utf8BomStatus {
    param(
        [byte[]]$Bytes
    )
    if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF) {
        return 'utf8-bom'
    }
    return 'no-bom'
}

function Test-Utf8 {
    param(
        [byte[]]$Bytes
    )
    try {
        $utf8 = [System.Text.UTF8Encoding]::new($false, $true)
        [void]$utf8.GetString($Bytes)
        return $true
    } catch {
        return $false
    }
}

$target = Resolve-Path $Path
$files = Get-ChildItem $target -Recurse -File | Where-Object {
    $_.Extension -in @('.md', '.java', '.xml', '.vue', '.js', '.ts', '.json', '.yml', '.yaml', '.properties', '.sql', '.ps1')
}

$result = foreach ($file in $files) {
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    [pscustomobject]@{
        Path = $file.FullName
        Utf8 = Test-Utf8 -Bytes $bytes
        Bom = Get-Utf8BomStatus -Bytes $bytes
        Size = $bytes.Length
    }
}

$result | Sort-Object Path | Format-Table -AutoSize

