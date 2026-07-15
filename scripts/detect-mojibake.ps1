param(
    [string]$Path = '.'
)

$ErrorActionPreference = 'Stop'

# Common characters that appear when UTF-8 Chinese text is decoded with the wrong code page.
# Kept as numeric code points so this script remains ASCII-only and is not damaged by console encoding.
$patterns = @(
    [string][char]0x951B,
    [string][char]0x9286,
    [string][char]0x20AC,
    [string][char]0x6D5C,
    [string][char]0x6D63,
    [string][char]0x93C8,
    [string][char]0x943E,
    [string][char]0x6D93,
    [string][char]0x9580,
    [string][char]0x95C7,
    [string][char]0x7009,
    [string][char]0x93BC,
    [string][char]0x6960,
    [string][char]0x934F,
    [string][char]0x7ECB,
    [string][char]0xFFFD
)

$excludedDirectories = @('node_modules', '.next', '.git', '.npm-cache', '.tmp')

$target = Resolve-Path $Path
$files = Get-ChildItem $target -Recurse -File | Where-Object {
    $_.Extension -in @('.md', '.js', '.ts', '.tsx', '.json', '.yml', '.yaml', '.properties', '.sql', '.ps1', '.env', '.example') -and
    -not ($_.FullName -split '[\\/]' | Where-Object { $excludedDirectories -contains $_ })
}

$hits = @()
foreach ($file in $files) {
    try {
        $text = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($file.FullName))
        foreach ($pattern in $patterns) {
            if ($text.Contains($pattern)) {
                $hits += [pscustomobject]@{
                    Path = $file.FullName
                    Pattern = ('U+{0:X4}' -f [int][char]$pattern)
                }
                break
            }
        }
    } catch {
        continue
    }
}

if ($hits.Count -eq 0) {
    Write-Host 'No obvious mojibake markers found.'
} else {
    $hits | Sort-Object Path | Format-Table -AutoSize
    exit 1
}
