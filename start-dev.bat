@echo off
title Menjalankan Marka Logistik ERP Frontend (Next.js)
color 0B
echo ========================================================
echo    MENJALANKAN SISTEM ERP MARKA LOGISTIK (Next.js)
echo ========================================================
echo.
cd /d "%~dp0frontend-next"

set "PATH=C:\nvm4w\nodejs;%PATH%"

echo Membuka server Next.js di http://localhost:3000 ...
echo Silakan buka browser Anda di: http://localhost:3000
echo.
npm run dev

pause
