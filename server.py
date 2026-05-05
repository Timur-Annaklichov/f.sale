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

if not os.path.exists(DB_FILE):
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump({"users": [], "accounts": [], "messages": []}, f)

pending_verifications = {} # code -> user_data

def send_tg_message(chat_id, text, reply_markup=None):
    try:
        url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
        payload = {"chat_id": chat_id, "text": text}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        urllib.request.urlopen(req)
    except Exception as e:
        print(f"TG Error: {e}")

def read_db():
    with open(DB_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_db(data):
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

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
                        send_tg_message(chat_id, "Отправьте мне 6-значный код, который вы получили на сайте.")
                    elif text.isdigit() and len(text) == 6:
                        found = False
                        for login, vdata in list(pending_verifications.items()):
                            if vdata.get('tgCode') == text:
                                vdata['chatId'] = chat_id
                                vdata['telegram'] = username
                                if vdata.get('recovery'):
                                    vdata['verified'] = True
                                    send_tg_message(chat_id, "Код подтвержден. Вернитесь на сайт для сброса пароля.")
                                else:
                                    db = read_db()
                                    existing = next((u for u in db['users'] if u['login'].lower() == login), None)
                                    if existing:
                                        existing['chatId'] = chat_id
                                        existing['telegram'] = username
                                        vdata['user'] = existing
                                    else:
                                        new_user = {k: v for k, v in vdata.items() if k not in ['tgCode', 'verified', 'user']}
                                        db['users'].append(new_user)
                                        vdata['user'] = new_user
                                    save_db(db)
                                    vdata['verified'] = True
                                    send_tg_message(chat_id, "Аккаунт успешно привязан! Вы можете вернуться на сайт.")
                                found = True
                                break
                        if not found:
                            send_tg_message(chat_id, "Код не найден или устарел.")
                    else:
                        send_tg_message(chat_id, "Пожалуйста, отправьте 6-значный код.")

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
        elif parsed_path == '/api/auth/recover-init':
            import random
            login = params.get('login', [''])[0].lower()
            db = self.read_db()
            user = next((u for u in db['users'] if u['login'].lower() == login), None)
            if user and user.get('chatId'):
                code = str(random.randint(100000, 999999))
                pending_verifications[login] = {'login': login, 'tgCode': code, 'verified': False, 'recovery': True}
                self.send_json_response({'success': True, 'code': code})
            else:
                self.send_json_response({'success': False, 'message': 'Аккаунт не привязан к Telegram или не существует'})
        elif parsed_path == '/api/auth/check-status':
            login = params.get('login', [''])[0].lower()
            if login in pending_verifications:
                vdata = pending_verifications[login]
                if vdata.get('verified'):
                    if vdata.get('recovery'):
                        self.send_json_response({'success': True, 'step': 'password'})
                    else:
                        user_data = vdata.get('user')
                        pending_verifications.pop(login)
                        self.send_json_response({'success': True, 'user': user_data})
                else:
                    self.send_json_response({'success': False, 'pending': True})
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
            import random
            code = str(random.randint(100000, 999999))
            data['id'] = str(int(datetime.now().timestamp() * 1000))
            data['tgCode'] = code
            data['verified'] = False
            pending_verifications[data['login'].lower()] = data
            self.send_json_response({'success': True, 'code': code})
        elif parsed_path == '/api/auth/request-link':
            # Used for existing users to bind TG
            import random
            login = data.get('login')
            telegram = data.get('telegram')
            code = str(random.randint(100000, 999999))
            pending_verifications[login.lower()] = {'login': login, 'telegram': telegram, 'tgCode': code, 'verified': False}
            self.send_json_response({'success': True, 'code': code})
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
        elif parsed_path == '/api/auth/verify-recovery':
            login = data.get('login').lower()
            new_hash = data.get('passwordHash')
            if login in pending_verifications:
                vdata = pending_verifications[login]
                if vdata.get('recovery') and vdata.get('verified'):
                    pending_verifications.pop(login)
                    db = self.read_db()
                    user = next((u for u in db['users'] if u['login'].lower() == login), None)
                    if user:
                        user['passwordHash'] = new_hash
                        self.save_db(db)
                        self.send_json_response({'success': True})
                    else:
                        self.send_json_response({'success': False, 'message': 'Пользователь не найден'})
                else:
                    self.send_json_response({'success': False, 'message': 'Сессия не подтверждена'})
            else:
                self.send_json_response({'success': False, 'message': 'Сессия не найдена'})
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
        db = read_db()
        new_msg = {
            'id': str(int(datetime.now().timestamp() * 1000)),
            'lotId': msg_data.get('lotId', 'general'),
            **msg_data,
            'createdAt': datetime.now().isoformat()
        }
        db.setdefault('messages', []).append(new_msg)
        save_db(db)

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

import socketserver

class ThreadingSimpleServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    pass

if __name__ == '__main__':
    server = ThreadingSimpleServer(('', PORT), DatabaseHandler)
    print(f"Server started at port {PORT}")
    server.serve_forever()
