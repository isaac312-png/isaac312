require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { initDatabase, getDb } = require('./database');
const { signup, verifyOTP, login, getUser, ensureAdminAccount } = require('./auth');
const { startInvestment, finalizeCompletedInvestments } = require('./investment');
const { getStocks, updateStockPrices } = require('./stocks');
const { submitWithdrawal, sendWithdrawalEmail } = require('./email');

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

// ========== TEMPORARY ADMIN DEBUG ENDPOINTS ==========
app.get('/api/create-admin', async (req, res) => {
    const supabase = getDb();
    const hashed = bcrypt.hashSync('2026ifatall', 10);
    const { error } = await supabase
        .from('users')
        .upsert([{ 
            first_name: 'Admin', 
            last_name: 'User', 
            email: 'admin@gmail.com', 
            password: hashed, 
            verified: 1, 
            role: 'admin' 
        }], { onConflict: 'email' });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Admin created/updated successfully' });
});

app.get('/api/reset-admin', async (req, res) => {
    const supabase = getDb();
    const newHash = bcrypt.hashSync('2026ifatall', 10);
    const { error } = await supabase
        .from('users')
        .update({ password: newHash })
        .eq('email', 'admin@gmail.com');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Admin password reset' });
});

app.post('/api/debug-login', async (req, res) => {
    const supabase = getDb();
    const { email, password } = req.body;
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
    if (error) return res.json({ error: error.message, user: null });
    const match = bcrypt.compareSync(password, user.password);
    res.json({ 
        exists: !!user, 
        passwordMatch: match,
        userRole: user?.role,
        verified: user?.verified
    });
});
// ========== END DEBUG ENDPOINTS ==========

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

// ========== WITHDRAWAL ENDPOINT ==========
app.post('/api/withdraw', authenticate, async (req, res) => {
    const { amount, method, details } = req.body;
    if (!amount || !method || !details) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    if (amount <= 0) {
        return res.status(400).json({ error: 'Amount must be positive' });
    }

    const supabase = getDb();

    // 1. Get current balances and email
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('deposit_balance, profit_accumulated, email')
        .eq('id', req.userId)
        .single();
    if (userError || !user) {
        return res.status(500).json({ error: 'User not found' });
    }

    let deposit = user.deposit_balance || 0;
    let profit = user.profit_accumulated || 0;
    let total = deposit + profit;
    if (amount > total) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }

    // 2. Deduct balance (deposit first, then profit)
    let newDeposit = deposit;
    let newProfit = profit;
    if (amount <= deposit) {
        newDeposit = deposit - amount;
    } else {
        let remainder = amount - deposit;
        newDeposit = 0;
        newProfit = profit - remainder;
    }

    // 3. Insert withdrawal record
    const { data: withdrawal, error: insertError } = await supabase
        .from('withdrawals')
        .insert([{
            user_id: req.userId,
            amount: amount,
            method: method,
            details: JSON.stringify(details),
            status: 'pending',
            created_at: Date.now()
        }])
        .select();

    if (insertError) {
        console.error('Withdrawal insert error:', insertError);
        return res.status(500).json({ error: 'Failed to record withdrawal' });
    }

    // 4. Update user balances
    const { error: updateError } = await supabase
        .from('users')
        .update({ deposit_balance: newDeposit, profit_accumulated: newProfit })
        .eq('id', req.userId);
    if (updateError) {
        console.error('Balance update error:', updateError);
        // Rollback: delete the withdrawal we just inserted
        await supabase.from('withdrawals').delete().eq('id', withdrawal[0].id);
        return res.status(500).json({ error: 'Failed to update balance' });
    }

    // 5. Send email notification (fire and forget)
    sendWithdrawalEmail(user.email, amount, method, details, withdrawal[0].id).catch(err => console.error('Email send error:', err));

    // 6. Return success
    res.json({ success: true, id: withdrawal[0].id, message: 'Withdrawal request saved' });
});

// ========== GET USER'S WITHDRAWAL HISTORY ==========
app.get('/api/withdrawals', authenticate, async (req, res) => {
    const supabase = getDb();
    const { data, error } = await supabase
        .from('withdrawals')
        .select('id, amount, method, status, created_at')
        .eq('user_id', req.userId)
        .order('created_at', { ascending: false })
        .limit(10);
    if (error) {
        console.error('Fetch withdrawals error:', error);
        return res.status(500).json({ error: error.message });
    }
    res.json(data || []);
});

// ========== ADMIN ENDPOINTS ==========
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

// ========== OTP LOGS ENDPOINT (for admin panel) ==========
app.get('/api/admin/otp-logs', authenticate, isAdmin, async (req, res) => {
    const supabase = getDb();
    const { data, error } = await supabase
        .from('otp_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

// ========== CREATE OTP LOGS TABLE (Admin only, run once) ==========
app.post('/api/admin/create-otp-table', authenticate, isAdmin, async (req, res) => {
    // Use the service role key for direct SQL if available, otherwise fallback to pg
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && supabaseUrl) {
        try {
            // Attempt to use Supabase's pg RPC (if exec_sql function exists)
            const { createClient } = require('@supabase/supabase-js');
            const supabaseAdmin = createClient(supabaseUrl, serviceKey);
            const { error } = await supabaseAdmin.rpc('exec_sql', {
                query: `
                    CREATE TABLE IF NOT EXISTS otp_logs (
                        id BIGSERIAL PRIMARY KEY,
                        email TEXT NOT NULL,
                        otp TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW(),
                        used BOOLEAN DEFAULT FALSE
                    );
                `
            });
            if (!error) {
                return res.json({ success: true, message: 'Table created via RPC.' });
            }
            console.warn('RPC failed, trying direct pg:', error.message);
        } catch (e) {
            console.warn('RPC error:', e.message);
        }
    }

    // Fallback: use PostgreSQL driver if connection string provided
    const dbUrl = process.env.SUPABASE_DATABASE_URL;
    if (dbUrl) {
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS otp_logs (
                    id BIGSERIAL PRIMARY KEY,
                    email TEXT NOT NULL,
                    otp TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    used BOOLEAN DEFAULT FALSE
                );
            `);
            await pool.end();
            return res.json({ success: true, message: 'Table created via direct SQL.' });
        } catch (err) {
            console.error('Direct SQL error:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    res.status(400).json({ error: 'No method available to create table. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_DATABASE_URL.' });
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
