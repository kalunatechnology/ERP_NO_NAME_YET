@echo off
cd /d "%~dp0"
echo ERP Frontend Prototype
echo Open http://127.0.0.1:5500
python -m http.server 5500
pause
