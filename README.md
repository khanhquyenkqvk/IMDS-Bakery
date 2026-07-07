## Hướng dẫn cài đặt

### 1. Cài đặt Backend
```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
python app.py
```

### 2. Chạy Frontend
```bash
cd frontend
python -m http.server 8000
# Sau đó truy cập http://localhost:8000/login/index.html



