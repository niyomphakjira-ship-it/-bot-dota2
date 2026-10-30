@echo off
chcp 65001 >nul
title Dota 2 Discord Bot
echo Starting Dota 2 Bot...
cd /d "%~dp0bot"
node src/index.js
pause
