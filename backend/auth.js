const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('./database');
const { sendOTPEmail } = require('./email');

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function ensureAdminAccount() {
    const supabase = getDb();
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || '2026ifatall';
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);

    const { data: existing, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', adminEmail)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') {
        console.error('Admin check error:', error);
        return;
    }
    if (!existing) {
        const { error: insertError } = await supabase
            .from('users')
            .insert([{ first_name: 'Admin', last_name: 'User', email: adminEmail, password: hashedPassword, verified: 1, role: 'admin' }]);
        if (insertError) console.error('Admin creation error:', insertError);
        else console.log('✅ Admin account created:', adminEmail);
    } else if (existing.role !== 'admin') {
        const { error: updateError } = await supabase
            .from('users')
            .update({ role: 'admin' })
            .eq('email', adminEmail);
        if (updateError) console.error('Admin role update error:', updateError);
        else console.log('✅ User promoted to admin:', adminEmail);
    } else {
        console.log('✅ Admin account already exists:', adminEmail);
    }
}

async function signup(req, res) {
    const { first_name, last_name, email, password } = req.body;
    if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({ error: 'All fields required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const otp = generateOTP();
    const otpExpiry = Date.now() + 10 * 60 * 1000;
    const supabase = getDb();

    // Check existing user
    const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

    if (fetchError) {
        console.error('Signup DB error:', fetchError);
        return res.status(500).json({ error: 'Database error' });
    }

    if (existingUser) {
        if (existingUser.verified === 1) {
            return res.status(400).json({ error: 'Email already registered and verified' });
        } else {
            // Update unverified user
            const { error: updateError } = await supabase
                .from('users')
                .update({ first_name, last_name, password: hashedPassword, otp, otp_expiry: otpExpiry })
                .eq('email', email);
            if (updateError) {
                console.error('Update error:', updateError);
                return res.status(500).json({ error: 'Failed to update user' });
            }
            await sendOTPEmail(email, otp);
            return res.json({ message: 'OTP sent to your email' });
        }
    }

    // Create new user
    const { error: insertError } = await supabase
        .from('users')
        .insert([{ first_name, last_name, email, password: hashedPassword, otp, otp_expiry: otpExpiry, verified: 0 }]);
    if (insertError) {
        console.error('Insert error:', insertError);
        return res.status(500).json({ error: 'Failed to create user' });
    }
    await sendOTPEmail(email, otp);
    res.json({ message: 'OTP sent to your email' });
}

async function verifyOTP(req, res) {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });
    const supabase = getDb();

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();
    if (error || !user) return res.status(404).json({ error: 'User not found' });

    if (user.verified === 1) {
        const token = jwt.sign(
            { id: user.id, email, firstName: user.first_name, lastName: user.last_name, role: user.role || 'user' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        return res.json({ message: 'Already verified', token });
    }

    if (user.otp === otp && user.otp_expiry > Date.now()) {
        const { error: updateError } = await supabase
            .from('users')
            .update({ verified: 1, otp: null, otp_expiry: null })
            .eq('id', user.id);
        if (updateError) {
            console.error('Verify update error:', updateError);
            return res.status(500).json({ error: 'Database error' });
        }
        const token = jwt.sign(
            { id: user.id, email, firstName: user.first_name, lastName: user.last_name, role: user.role || 'user' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({ message: 'Verified successfully', token });
    } else {
        res.status(400).json({ error: 'Invalid or expired OTP' });
    }
}

async function login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const supabase = getDb();

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();
    if (error || !user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.verified !== 1) return res.status(401).json({ error: 'Please verify your email first' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
        { id: user.id, email, firstName: user.first_name, lastName: user.last_name, role: user.role || 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
    res.json({ message: 'Login successful', token });
}

async function getUser(req, res) {
    const supabase = getDb();
    const { data: user, error } = await supabase
        .from('users')
        .select('first_name, last_name, deposit_balance, invested_amount, profit_accumulated, total_balance, investment_end_time, investment_rate_per_sec, active_plan, role')
        .eq('id', req.userId)
        .single();
    if (error || !user) return res.status(500).json({ error: 'User not found' });
    res.json(user);
}

module.exports = { signup, verifyOTP, login, getUser, ensureAdminAccount };
