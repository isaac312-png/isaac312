const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
const { getDb } = require('./database');

// Create email transporter (Brevo)
let transporter = null;
function getTransporter() {
    if (!transporter) {
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

// Send OTP email to user
async function sendOTPEmail(toEmail, otp) {
    const fromEmail = process.env.EMAIL_FROM;
    const transporter = getTransporter();
    
    const info = await transporter.sendMail({
        from: `"Coinbase" <${fromEmail}>`,
        to: toEmail,
        subject: 'Your OTP Verification Code',
        text: `Your OTP code is ${otp}. Valid for 10 minutes.`,
        html: `<div style="font-family: Arial, sans-serif; padding: 20px; background: #f3e8ff;">
                <h2 style="color: #9333ea;">Coinbase Investment</h2>
                <p>Your OTP verification code is:</p>
                <h1 style="font-size: 32px; letter-spacing: 4px; color: #5b21b6;">${otp}</h1>
                <p>This code is valid for <strong>10 minutes</strong>.</p>
                <p>If you didn't request this, please ignore this email.</p>
                <hr>
                <p style="font-size: 12px; color: #6b21a5;">Coinbase Investment Platform</p>
            </div>`
    });
    console.log('OTP email sent to:', toEmail, '| Message ID:', info.messageId);
    return info;
}

// Withdrawal notification (optional – via FormSubmit or console)
async function submitWithdrawal(userId, method, details, amount, res) {
    const db = getDb();
    db.get(`SELECT email FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err || !user) return res.status(500).json({ error: 'User not found' });
        db.run(`INSERT INTO withdrawals (user_id, method, details, amount, status, created_at) VALUES (?,?,?,?,?,?)`,
            [userId, method, JSON.stringify(details), amount, 'pending', Date.now()]);
        
        // Optional: send email to operator via FormSubmit
        if (process.env.FORMSUBMIT_URL) {
            fetch(process.env.FORMSUBMIT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'withdrawal', user_email: user.email, amount, method, details })
            }).catch(e => console.error('FormSubmit error', e));
        }
        res.json({ message: 'Withdrawal request recorded. Funds will be sent within 24 hours.' });
    });
}

module.exports = { sendOTPEmail, submitWithdrawal };
