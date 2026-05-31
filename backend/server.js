require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const { initDatabase, getDb } = require('./database');
const { signup, verifyOTP, login, getUser, ensureAdminAccount } = require('./auth');
const { startInvestment, finalizeCompletedInvestments } = require('./investment');
const { getStocks, updateStockPrices } = require('./stocks');
const { submitWithdrawal } = require('./email');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/test', (req, res) => res.json({ message: 'Backend works' }));

// Auth routes
app.post('/api/signup', signup);
app.post('/api/verify', verifyOTP);
app.post('/api/login', login);

// Authentication middleware
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        req.userRole = decoded.role;
        const supabase = getDb();
        await supabase.from('users').update({ last_seen: Date.now() }).eq('id', req.userId);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

function isAdmin(req, res, next) {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
}

// Client endpoints
app.get('/api/user', authenticate, getUser);
app.get('/api/stocks', authenticate, (req, res) => getStocks(res));
app.post('/api/invest-custom', authenticate, async (req, res) => {
    const { planId, amount } = req.body;
    if (!planId || !amount || amount < 10) {
        return res.status(400).json({ error: 'Invalid amount (min 10)' });
    }
    await startInvestment(req.userId, planId, amount, res);
});
app.post('/api/withdraw', authenticate, (req, res) => {
    const { amount, method, details } = req.body;
    if (!amount || !method || !details) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    submitWithdrawal(req.userId, method, details, amount, res);
});

// Admin endpoints
app.get('/api/admin/users', authenticate, isAdmin, async (req, res) => {
    const supabase = getDb();
    const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, deposit_balance, invested_amount, profit_accumulated, total_balance, last_seen')
        .eq('role', 'user');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.put('/api/admin/users/:id/balance', authenticate, isAdmin, async (req, res) => {
    const { amount } = req.body;
    const userId = req.params.id;
    if (typeof amount !== 'number') return res.status(400).json({ error: 'Amount must be number' });
    const supabase = getDb();
    const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('deposit_balance')
        .eq('id', userId)
        .single();
    if (fetchError) return res.status(500).json({ error: 'User not found' });
    const newBalance = (user.deposit_balance || 0) + amount;
    const { error: updateError } = await supabase
        .from('users')
        .update({ deposit_balance: newBalance })
        .eq('id', userId);
    if (updateError) return res.status(500).json({ error: updateError.message });
    res.json({ message: 'Balance updated' });
});

// Cron jobs
cron.schedule('* * * * *', () => finalizeCompletedInvestments());
cron.schedule('*/10 * * * * *', () => updateStockPrices());

// Start server
async function startServer() {
    await initDatabase();
    console.log('✅ Connected to Supabase');
    await ensureAdminAccount();
    console.log('✅ Admin account checked/created');
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`✅ Health check: http://localhost:${PORT}/health`);
    });
}

startServer();
