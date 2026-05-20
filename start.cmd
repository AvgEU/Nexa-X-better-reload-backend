@echo off
chcp 65001 > nul
title Nexa Backend

echo [*] Killing old processes on ports 5353, 5354, 8080...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5353 \|:5354 \|:8080 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak > nul

echo [*] Starting Nexa...
bun run src/index.ts
pause
