const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Helper to read DB
function readDb() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { users: [], accounts: [], messages: [] };
    }
}

// Helper to write DB
function writeDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// API Endpoints
app.get('/api/database', (req, res) => {
    res.json(readDb());
});

app.post('/api/database', (req, res) => {
    const data = req.body;
    writeDb(data);
    res.json({ success: true });
});

// Chat Endpoints
app.get('/api/messages', (req, res) => {
    const db = readDb();
    res.json(db.messages || []);
});

app.post('/api/messages', (req, res) => {
    const db = readDb();
    const newMessage = {
        id: Date.now().toString(),
        ...req.body,
        createdAt: new Date().toISOString()
    };
    db.messages = db.messages || [];
    db.messages.push(newMessage);
    // Keep last 100 messages
    if (db.messages.length > 100) db.messages.shift();
    writeDb(db);
    res.json(newMessage);
});

// Admin management
app.post('/api/users/promote', (req, res) => {
    const { login } = req.body;
    const db = readDb();
    const user = db.users.find(u => u.login.toLowerCase() === login.toLowerCase());
    if (user) {
        user.role = 'admin';
        writeDb(db);
        res.json({ success: true, user });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
