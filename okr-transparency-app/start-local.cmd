@echo off
cd /d "%~dp0"
set OKR_ADMIN_TOKEN=dev-admin-token
set AUTH_URL=http://192.168.94.42:3001
set NEXTAUTH_URL=http://192.168.94.42:3001
set NEXT_PUBLIC_AUTH_ORIGIN=http://192.168.94.42:3001
"C:\Users\rayne\Tools\node-v24.16.0-win-x64\node.exe" node_modules\next\dist\bin\next dev --hostname 0.0.0.0 --port 3001
