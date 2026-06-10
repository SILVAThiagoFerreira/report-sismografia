@echo off
setlocal

REM Caminho da pasta atual
set "DIR=%~dp0"

echo Limpando pasta: %DIR%
echo.

REM Apaga todos os arquivos EXCETO .gitkeep e Limpar.bat
for %%F in ("%DIR%\*") do (
    if /I not "%%~nxF"==".gitkeep" if /I not "%%~nxF"=="Limpar.bat" (
        del /F /Q "%%F" 2>nul
    )
)

REM Apaga todas as pastas
for /D %%D in ("%DIR%\*") do (
    rd /S /Q "%%D"
)

echo.
echo Pasta limpa. Mantidos apenas: .gitkeep e Limpar.bat
pause