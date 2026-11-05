@echo off
title Menjalankan Marka Logistik ERP Frontend
echo ========================================================
echo    Menjalankan Marka Logistik ERP (Frontend-Next)
echo ========================================================
echo.
cd /d "%~dp0\frontend-next"

echo Memeriksa dependensi dan menjalankan server Next.js...
echo Tampilan aplikasi akan tersedia di: http://localhost:3000
echo.
npm run dev

pause

