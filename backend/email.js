const nodemailer = require('nodemailer');
const { getDb } = require('./database');

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

async function sendOTPEmail(toEmail, otp) {
    const transporter = getTransporter();
    const fromEmail = process.env.EMAIL_FROM || 'admin@gmail.com';
    
    try {
        const info = await transporter.sendMail({
            from: `"Coinbase Investment" <${fromEmail}>`,
            to: toEmail,
            subject: 'Your OTP Verification Code',
            text: `Your OTP code is ${otp}. Valid for 10 minutes.`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: linear-gradient(135deg, #d9c8ff, #f3e8ff);">
                    <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 32px; padding: 30px; text-align: center;">
                        <h1 style="color: #9333ea; font-family: 'Playfair Display', Georgia, serif;">Coinbase</h1>
                        <h2 style="color: #5b21b6;">Your OTP Code</h2>
                        <p style="font-size: 14px; color: #666;">Use the code below to verify your email address.</p>
                        <div style="background: #f3e8ff; padding: 15px; border-radius: 16px; margin: 20px 0;">
                            <span style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #5b21b6;">${otp}</span>
                        </div>
                        <p style="font-size: 12px; color: #999;">This code expires in 10 minutes.</p>
                        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e9d5ff;">
                        <p style="font-size: 11px; color: #aaa;">Coinbase Investment Platform</p>
                    </div>
                </div>
            `
        });
        console.log(`✅ OTP email sent to ${toEmail}: ${info.messageId}`);
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
