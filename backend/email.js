const { getDb } = require('./database');

async function sendOTPEmail(toEmail, otp) {
    const apiKey = process.env.BREVO_API_KEY;
    const fromEmail = process.env.EMAIL_FROM || 'admin@gmail.com';
    
    if (!apiKey) {
        console.error('❌ BREVO_API_KEY not set in environment variables');
        return false;
    }
    
    try {
        const fetch = require('node-fetch');
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify({
                sender: { email: fromEmail, name: 'Coinbase Investment' },
                to: [{ email: toEmail }],
                subject: '🔐 Your OTP Verification Code',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background: linear-gradient(135deg, #d9c8ff, #f3e8ff);">
                        <div style="max-width: 450px; margin: 0 auto; background: white; border-radius: 32px; padding: 35px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
                            <h1 style="color: #9333ea; font-family: 'Playfair Display', Georgia, serif; font-size: 28px; margin-bottom: 10px;">Coinbase</h1>
                            <h2 style="color: #5b21b6; font-size: 20px; margin-bottom: 20px;">Email Verification</h2>
                            <p style="font-size: 14px; color: #4a5568; margin-bottom: 25px;">Use the code below to complete your registration:</p>
                            <div style="background: #f3e8ff; padding: 20px; border-radius: 16px; margin: 20px 0; border: 2px dashed #c084fc;">
                                <span style="font-size: 40px; letter-spacing: 10px; font-weight: bold; color: #5b21b6;">${otp}</span>
                            </div>
                            <p style="font-size: 12px; color: #718096;">This code is valid for <strong>10 minutes</strong>.</p>
                            <hr style="margin: 25px 0; border: none; border-top: 1px solid #e9d5ff;">
                            <p style="font-size: 11px; color: #a0aec0;">If you didn't request this, please ignore this email.</p>
                            <p style="font-size: 11px; color: #c084fc; margin-top: 10px;">Coinbase Investment Platform</p>
                        </div>
                    </div>
                `
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log(`✅ OTP email sent to ${toEmail} - Message ID: ${result.messageId}`);
            return true;
        } else {
            const error = await response.text();
            console.error(`❌ Brevo API error (${response.status}): ${error}`);
            return false;
        }
    } catch (err) {
        console.error(`❌ Failed to send email to ${toEmail}:`, err.message);
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
