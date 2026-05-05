import http.server
import json
import os
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime
import os

# Supabase Setup (Optional Persistence)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Connected to Supabase")
    except ImportError:
        print("Supabase library not installed. Falling back to local DB.")
    except Exception as e:
        print(f"Supabase connection error: {e}")

DB_FILE = 'db.json'
TG_TOKEN = '8483206778:AAGzc0fy8JWIP5uZ24EK2Zv7iiSmM_ETD3M'

if not os.path.exists(DB_FILE):
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump({"users": [], "accounts": [], "messages": []}, f)

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
    import random
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
                    username = msg.get('from', {}).get('username', '').lower()
                    
                    if text == "/start":
                        # Check if this telegram user has a pending registration
                        found = False
                        for code_key, user_data in pending_verifications.items():
                            reg_tg = user_data.get('telegram', '').lstrip('@').lower()
                            if reg_tg == username:
                                code = str(random.randint(100000, 999999))
                                user_data['chatId'] = chat_id
                                user_data['tgCode'] = code
                                send_tg_message(chat_id, f"Ваш код: {code}")
                                found = True
                                break
                        if not found:
                            send_tg_message(chat_id, "Привет! Пожалуйста, сначала начните регистрацию на сайте f.sale и укажите ваш никнейм в Telegram.")
        except Exception as e:
            print(f"Bot Error: {e}")
            time.sleep(5)

threading.Thread(target=tg_bot_thread, daemon=True).start()

def get_supabase_db():
    if not supabase: return None
    try:
        users = supabase.table("users").select("*").execute().data
        accounts = supabase.table("accounts").select("*").execute().data
        messages = supabase.table("messages").select("*").execute().data
        return {"users": users, "accounts": accounts, "messages": messages}
    except Exception as e:
        print(f"Supabase fetch error: {e}")
        return None

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
        parsed_path = urllib.parse.urlparse(self.path).path
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)

        if parsed_path == '/api/database':
            self.serve_db()
        elif parsed_path == '/api/messages':
            self.serve_messages()
        elif parsed_path == '/api/auth/verify-code':
            login = params.get('login', [''])[0]
            code = params.get('code', [''])[0]
            if login in pending_verifications:
                user_data = pending_verifications[login]
                if user_data.get('tgCode') == code:
                    pending_verifications.pop(login)
                    user_data.pop('tgCode', None)
                    db = self.read_db()
                    # Check if it's an existing user or new
                    existing = next((u for u in db['users'] if u['login'] == login), None)
                    if existing:
                        existing['chatId'] = user_data['chatId']
                        existing['telegram'] = user_data['telegram']
                        user_data = existing
                    else:
                        db['users'].append(user_data)
                    self.save_db(db)
                    self.send_json_response({'success': True, 'user': user_data})
                else:
                    self.send_json_response({'success': False, 'message': 'Неверный код'})
            else:
                self.send_json_response({'success': False, 'message': 'Сессия не найдена'})
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
            data['id'] = str(int(datetime.now().timestamp() * 1000))
            pending_verifications[data['login']] = data
            self.send_json_response({'success': True})
        elif parsed_path == '/api/auth/request-link':
            # Used for existing users to bind TG
            login = data.get('login')
            telegram = data.get('telegram')
            pending_verifications[login] = {'login': login, 'telegram': telegram}
            self.send_json_response({'success': True})
        elif parsed_path == '/api/users/demote':
            db = self.read_db()
            user = next((u for u in db['users'] if u['login'] == data.get('login')), None)
            if user:
                user['role'] = 'user'
                self.save_db(db)
                self.send_json_response({'success': True})
            else:
                self.send_json_response({'success': False, 'message': 'User not found'})
        elif parsed_path == '/api/users/ban':
            db = self.read_db()
            user = next((u for u in db['users'] if u['login'] == data.get('login')), None)
            if user:
                user['banned'] = not user.get('banned', False)
                self.save_db(db)
                self.send_json_response({'success': True, 'banned': user['banned']})
            else:
                self.send_json_response({'success': False, 'message': 'User not found'})
        elif parsed_path == '/api/messages/delete':
            db = self.read_db()
            msg_id = data.get('id')
            db['messages'] = [m for m in db['messages'] if m.get('id') != msg_id]
            self.save_db(db)
            self.send_json_response({'success': True})
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
        remote = get_supabase_db()
        if remote: return remote
        
        if not os.path.exists(DB_FILE):
            return {'users': [], 'accounts': [], 'messages': []}
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)

    def save_db(self, data):
        # Save locally
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        # Save to Supabase if active
        if supabase:
            try:
                if data.get('users'):
                    supabase.table("users").upsert(data['users']).execute()
                if data.get('accounts'):
                    supabase.table("accounts").upsert(data['accounts']).execute()
                if data.get('messages'):
                    # Only upsert new messages to avoid slow large batch upserts
                    # For simplicity in this JSON-to-SQL migration, we'll upsert all for now
                    supabase.table("messages").upsert(data['messages']).execute()
            except Exception as e:
                print(f"Supabase save error: {e}")

    def send_json_response(self, data):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

import socketserver

class ThreadingSimpleServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    pass

if __name__ == '__main__':
    server = ThreadingSimpleServer(('', PORT), DatabaseHandler)
    print(f"Server started at port {PORT}")
    server.serve_forever()
