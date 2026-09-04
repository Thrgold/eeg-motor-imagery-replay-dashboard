@echo off
set "PROJECT_ROOT=%~dp0"
echo Start the frontend with: cd frontend ^&^& python -m http.server 5173
echo Start the configured replay backend with: cd backend ^&^& uvicorn main_frontend:app --host 127.0.0.1 --port 8080
exit /b 0
