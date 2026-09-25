@echo off
REM Daily TikTok post for Get It?  -  one ad a day, 7:30pm.
REM upload-tiktok.js refuses to post if anything went out in the last 20h,
REM and skips ads already recorded in tiktok_state.json, so this is safe to
REM leave running: it posts the next unposted ad, then exits.
cd /d "%~dp0"
echo. >> tiktok.log
echo [%date% %time%] --- run start --- >> tiktok.log
node upload-tiktok.js --post-next >> tiktok.log 2>&1
echo [%date% %time%] --- run end (exit %errorlevel%) --- >> tiktok.log
