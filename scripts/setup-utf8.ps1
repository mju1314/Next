$ErrorActionPreference = 'Stop'

chcp 65001 > $null

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Add-Content:Encoding'] = 'utf8'
$PSDefaultParameterValues['Export-Csv:Encoding'] = 'utf8'

Write-Host 'UTF-8 shell configured.'
Write-Host ('CodePage=' + [Console]::OutputEncoding.CodePage)
Write-Host ('InputEncoding=' + [Console]::InputEncoding.WebName)
Write-Host ('OutputEncoding=' + [Console]::OutputEncoding.WebName)

