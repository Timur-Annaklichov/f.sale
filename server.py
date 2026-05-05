import http.server
import json
import os
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime

PORT = int(os.environ.get('PORT', 3000))
DB_FILE = 'db.json'
TG_TOKEN = '8483206778:AAGzc0fy8JWIP5uZ24EK2Zv7iiSmM_ETD3M'

pending_verifications = {} # code -> user_data

def send_tg_message(chat_id, text):
    try:
        url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
        data = json.dumps({"chat_id": chat_id, "text": text}).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        urllib.request.urlopen(req)
    except Exception as e:
        print(f"TG Error: {e}")

def tg_bot_thread():
    offset = 0
    while True:
        try:
            url = f"https://api.telegram.org/bot{TG_TOKEN}/getUpdates?offset={offset}&timeout=30"
            with urllib.request.urlopen(url) as response:
                data = json.loads(response.read())
                for update in data.get('result', []):
                    offset = update['update_id'] + 1
                    msg = update.get('message', {})
                    text = msg.get('text', '').strip()
                    chat_id = msg.get('chat', {}).get('id')
                    
                    if text in pending_verifications:
                        user_data = pending_verifications[text]
                        user_data['chatId'] = chat_id
                        user_data['verified'] = True
                        send_tg_message(chat_id, "✅ Аккаунт успешно подтвержден! Теперь вы можете пользоваться сайтом.")
                    elif text == "/start":
                        send_tg_message(chat_id, "Привет! Пожалуйста, введите код верификации с сайта f.sale")
        except Exception as e:
            print(f"Bot Error: {e}")
            time.sleep(5)

threading.Thread(target=tg_bot_thread, daemon=True).start()

class DatabaseHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        parsed_path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if parsed_path == '/api/database':
            self.serve_db()
        elif parsed_path == '/api/messages':
            self.serve_messages()
        elif parsed_path == '/api/auth/check-status':
            code = params.get('code', [''])[0]
            if code in pending_verifications and pending_verifications[code].get('verified'):
                user_data = pending_verifications.pop(code)
                db = self.read_db()
                db['users'].append(user_data)
                self.save_db(db)
                self.send_json_response({'success': True, 'user': user_data})
            else:
                self.send_json_response({'success': False})
        else:
            # Serve static files
            path = parsed_path.lstrip('/')
            if not path:
                path = 'index.html'
            if os.path.exists(path):
                self.send_response(200)
                if path.endswith('.html'):
                    self.send_header('Content-type', 'text/html; charset=utf-8')
                elif path.endswith('.js'):
                    self.send_header('Content-type', 'application/javascript')
                elif path.endswith('.css'):
                    self.send_header('Content-type', 'text/css')
                self.end_headers()
                with open(path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404)

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path).path
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data)

        if parsed_path == '/api/database':
            self.save_db(data)
            self.send_json_response({'success': True})
        elif parsed_path == '/api/messages':
            self.add_message(data)
        elif parsed_path == '/api/users/promote':
            self.promote_user(data)
        elif parsed_path == '/api/auth/register-pending':
            import random
            code = str(random.randint(100000, 999999))
            data['id'] = str(int(datetime.now().timestamp() * 1000))
            data['verified'] = False
            pending_verifications[code] = data
            self.send_json_response({'success': True, 'code': code})
        else:
            self.send_error(404)

    def serve_db(self):
        db = self.read_db()
        self.send_json_response(db)

    def serve_messages(self):
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        is_all = params.get('all', ['false'])[0].lower() == 'true'
        lot_id = params.get('lotId', ['general'])[0]
        db = self.read_db()
        if is_all:
            messages = db.get('messages', [])
        else:
            messages = [m for m in db.get('messages', []) if m.get('lotId', 'general') == lot_id]
        self.send_json_response(messages)

    def save_db(self, data):
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def add_message(self, msg_data):
        db = self.read_db()
        new_msg = {
            'id': str(int(datetime.now().timestamp() * 1000)),
            'lotId': msg_data.get('lotId', 'general'),
            **msg_data,
            'createdAt': datetime.now().isoformat()
        }
        db.setdefault('messages', []).append(new_msg)
        self.save_db(db)

        # Notification logic
        if new_msg['lotId'].startswith('private_'):
            ids = new_msg['lotId'].split('_')
            sender_id = new_msg['userId']
            recipient_id = ids[1] if ids[1] != sender_id else ids[2]
            recipient = next((u for u in db.get('users', []) if u.get('id') == recipient_id), None)
            if recipient and recipient.get('chatId'):
                text = f"✉️ Новое сообщение от {new_msg['userName']}:\n{new_msg['text']}"
                send_tg_message(recipient['chatId'], text)
        
        self.send_json_response(new_msg)

    def promote_user(self, data):
        login = data.get('login', '').lower()
        db = self.read_db()
        found = False
        for user in db.get('users', []):
            if user.get('login', '').lower() == login:
                user['role'] = 'admin'
                found = True
                break
        if found:
            self.save_db(db)
            self.send_json_response({'success': True})
        else:
            self.send_response(404)
            self.end_headers()

    def read_db(self):
        if not os.path.exists(DB_FILE):
            return {'users': [], 'accounts': [], 'messages': []}
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)

    def send_json_response(self, data):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

if __name__ == '__main__':
    server = http.server.HTTPServer(('0.0.0.0', PORT), DatabaseHandler)
    print(f"Server started at http://localhost:{PORT}")
    server.serve_forever()
