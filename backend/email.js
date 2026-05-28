const nodemailer = require('nodemailer');
const { getDb } = require('./database');

let transporter = null;

function getTransporter() {
    if (!transporter && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        transporter = nodemailer.createTransport({
            host: 'smtp-relay.brevo.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }
    return transporter;
}

async function sendOTPEmail(toEmail, otp) {
    const transporter = getTransporter();
    const fromEmail = process.env.EMAIL_FROM;
    
    if (!transporter || !fromEmail) {
        console.log(`⚠️ Email not configured. OTP for ${toEmail}: ${otp}`);
        return true;
    }
    
    try {
        await transporter.sendMail({
            from: `"Coinbase" <${fromEmail}>`,
            to: toEmail,
            subject: 'Your OTP Verification Code',
            text: `Your OTP code is ${otp}. Valid for 10 minutes.`,
            html: `<div style="font-family: Arial; padding: 20px; background: #f3e8ff;">
                    <h2 style="color: #9333ea;">Coinbase Investment</h2>
                    <p>Your OTP code is:</p>
                    <h1 style="font-size: 32px; color: #5b21b6;">${otp}</h1>
                    <p>Valid for 10 minutes.</p>
                    </div>`
        });
        console.log(`✅ OTP email sent to ${toEmail}`);
        return true;
    } catch (err) {
        console.error(`❌ Failed to send email to ${toEmail}:`, err.message);
        console.log(`📝 Fallback - OTP for ${toEmail}: ${otp}`);
        return false;
    }
}

async function submitWithdrawal(userId, method, details, amount, res) {
    const db = getDb();
    db.get(`SELECT email FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err || !user) return res.status(500).json({ error: 'User not found' });
        db.run(`INSERT INTO withdrawals (user_id, method, details, amount, status, created_at) VALUES (?,?,?,?,?,?)`,
            [userId, method, JSON.stringify(details), amount, 'pending', Date.now()], (err) => {
                if (err) {
                    console.error('Withdrawal insert error:', err);
                    return res.status(500).json({ error: 'Failed to record withdrawal' });
                }
                res.json({ message: 'Withdrawal request recorded. Funds will be sent within 24 hours.' });
            });
    });
}

module.exports = { sendOTPEmail, submitWithdrawal };
