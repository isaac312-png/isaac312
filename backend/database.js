const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

let db = null;

function initDatabase() {
    return new Promise((resolve, reject) => {
        const dbPath = path.join(__dirname, 'broker.db');
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) return reject(err);
            db.serialize(() => {
                db.run(`CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    first_name TEXT,
                    last_name TEXT,
                    email TEXT UNIQUE,
                    password TEXT,
                    verified INTEGER DEFAULT 0,
                    role TEXT DEFAULT 'user',
                    last_seen INTEGER DEFAULT 0,
                    otp TEXT,
                    otp_expiry INTEGER,
                    deposit_balance REAL DEFAULT 0,
                    invested_amount REAL DEFAULT 0,
                    profit_accumulated REAL DEFAULT 0,
                    total_balance REAL DEFAULT 0,
                    investment_end_time INTEGER DEFAULT 0,
                    investment_rate_per_sec REAL DEFAULT 0,
                    active_plan TEXT
                )`);
                db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    method TEXT,
                    details TEXT,
                    amount REAL,
                    status TEXT DEFAULT 'pending',
                    created_at INTEGER
                )`);
                db.run(`CREATE TABLE IF NOT EXISTS stocks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT,
                    name TEXT,
                    price REAL,
                    change_percent REAL
                )`);
                // Create default admin
                const adminEmail = process.env.ADMIN_EMAIL || 'admin@coinbase.com';
                const adminPass = process.env.ADMIN_PASSWORD || 'Admin123';
                const hashed = bcrypt.hashSync(adminPass, 10);
                db.run(`INSERT OR IGNORE INTO users (first_name, last_name, email, password, verified, role) VALUES (?, ?, ?, ?, 1, 'admin')`,
                    ['Admin', 'User', adminEmail, hashed]);
                // Insert default stocks if empty
                db.get(`SELECT COUNT(*) as c FROM stocks`, (err, row) => {
                    if (!err && row.c === 0) {
                        const stocks = [
                            { symbol: 'AAPL', name: 'Apple Inc.', price: 175.50 },
                            { symbol: 'TSLA', name: 'Tesla Inc.', price: 245.30 },
                            { symbol: 'BTC', name: 'Bitcoin', price: 65000 },
                            { symbol: 'ETH', name: 'Ethereum', price: 3400 }
                        ];
                        const stmt = db.prepare(`INSERT INTO stocks (symbol, name, price, change_percent) VALUES (?, ?, ?, 0)`);
                        stocks.forEach(s => stmt.run(s.symbol, s.name, s.price));
                        stmt.finalize();
                    }
                });
                resolve();
            });
        });
    });
}
function getDb() { return db; }
module.exports = { initDatabase, getDb };