import http.server
import json
import os
from datetime import datetime

PORT = int(os.environ.get('PORT', 3000))
DB_FILE = 'db.json'

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
        if self.path == '/api/database':
            self.serve_db()
        elif self.path == '/api/messages':
            self.serve_messages()
        else:
            # Serve static files
            path = self.path.lstrip('/')
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
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data)

        if self.path == '/api/database':
            self.save_db(data)
            self.send_json_response({'success': True})
        elif self.path == '/api/messages':
            self.add_message(data)
        elif self.path == '/api/users/promote':
            self.promote_user(data)
        else:
            self.send_error(404)

    def serve_db(self):
        db = self.read_db()
        self.send_json_response(db)

    def serve_messages(self):
        db = self.read_db()
        self.send_json_response(db.get('messages', []))

    def save_db(self, data):
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def add_message(self, msg_data):
        db = self.read_db()
        new_msg = {
            'id': str(int(datetime.now().timestamp() * 1000)),
            **msg_data,
            'createdAt': datetime.now().isoformat()
        }
        if 'messages' not in db:
            db['messages'] = []
        db['messages'].append(new_msg)
        if len(db['messages']) > 100:
            db['messages'].pop(0)
        self.save_db(db)
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
