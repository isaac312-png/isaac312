const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('./database');
const { sendOTPEmail } = require('./email');

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Auto-create admin account on server start
async function ensureAdminAccount() {
    const db = getDb();
    const adminEmail = 'admin@gmail.com';
    const adminPassword = '2026ifatall';
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);
    
    db.get(`SELECT * FROM users WHERE email = ?`, [adminEmail], (err, user) => {
        if (err) return console.error('Admin check error:', err);
        if (!user) {
            db.run(`INSERT INTO users (first_name, last_name, email, password, verified, role) 
                    VALUES ('Admin', 'User', ?, ?, 1, 'admin')`, [adminEmail, hashedPassword], (err) => {
                if (err) console.error('Admin creation error:', err);
                else console.log('✅ Admin account created:', adminEmail);
            });
        } else if (user.role !== 'admin') {
            db.run(`UPDATE users SET role = 'admin' WHERE email = ?`, [adminEmail], (err) => {
                if (err) console.error('Admin role update error:', err);
                else console.log('✅ User promoted to admin:', adminEmail);
            });
        } else {
            console.log('✅ Admin account already exists:', adminEmail);
        }
    });
}

async function signup(req, res) {
    const { first_name, last_name, email, password } = req.body;
    if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password too short' });
    }

    const hashed = bcrypt.hashSync(password, 10);
    const otp = generateOTP();
    const expiry = Date.now() + 10 * 60 * 1000;
    const db = getDb();

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (user) {
            if (user.verified === 1) {
                return res.status(400).json({ error: 'Email already exists and verified' });
            } else {
                db.run(`UPDATE users SET first_name = ?, last_name = ?, password = ?, otp = ?, otp_expiry = ? WHERE email = ?`,
                    [first_name, last_name, hashed, otp, expiry, email], async (err) => {
                        if (err) return res.status(500).json({ error: 'Failed to update' });
                        try {
                            await sendOTPEmail(email, otp);
                            res.json({ message: 'New OTP sent to your email' });
                        } catch (e) {
                            res.status(500).json({ error: 'Failed to send OTP' });
                        }
                    });
                return;
            }
        }

        db.run(`INSERT INTO users (first_name, last_name, email, password, otp, otp_expiry, verified) VALUES (?, ?, ?, ?, ?, ?, 0)`,
            [first_name, last_name, email, hashed, otp, expiry], async function(err) {
                if (err) {
                    console.error('Signup DB error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                try {
                    await sendOTPEmail(email, otp);
                    res.json({ message: 'OTP sent to your email' });
                } catch (emailErr) {
                    console.error('Email error:', emailErr);
                    res.status(500).json({ error: 'Failed to send OTP email' });
                }
            });
    });
}

async function verifyOTP(req, res) {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });
    const db = getDb();
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        if (user.verified) {
            const token = jwt.sign(
                { id: user.id, email, firstName: user.first_name, lastName: user.last_name, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
            return res.json({ message: 'Already verified', token });
        }
        if (user.otp === otp && user.otp_expiry > Date.now()) {
            db.run(`UPDATE users SET verified = 1, otp = NULL, otp_expiry = NULL WHERE id = ?`, [user.id]);
            const token = jwt.sign(
                { id: user.id, email, firstName: user.first_name, lastName: user.last_name, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
            res.json({ message: 'Verified successfully', token });
        } else {
            res.status(400).json({ error: 'Invalid or expired OTP' });
        }
    });
}

async function login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const db = getDb();
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
        if (user.verified !== 1) return res.status(401).json({ error: 'Please verify your email first' });
        if (bcrypt.compareSync(password, user.password)) {
            const token = jwt.sign(
                { id: user.id, email, firstName: user.first_name, lastName: user.last_name, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
            res.json({ message: 'Login success', token });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
}

async function getUser(req, res) {
    const db = getDb();
    db.get(`SELECT first_name, last_name, deposit_balance, invested_amount, profit_accumulated, total_balance, investment_end_time, investment_rate_per_sec, active_plan, role
            FROM users WHERE id = ?`, [req.userId], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'User not found' });
        res.json(row);
    });
}

module.exports = { signup, verifyOTP, login, getUser, ensureAdminAccount };
