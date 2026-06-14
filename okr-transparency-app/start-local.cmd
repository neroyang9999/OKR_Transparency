@echo off
cd /d "%~dp0"
set OKR_ADMIN_TOKEN=local-admin-token
"C:\Users\rayne\Tools\node-v24.16.0-win-x64\node.exe" node_modules\next\dist\bin\next start --port 3000
