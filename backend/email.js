const { CourierClient } = require('@trycourier/courier');
const { getDb } = require('./database');

// Initialize Courier client
const courier = CourierClient({
  authorizationToken: process.env.COURIER_API_KEY,
});

async function sendOTPEmail(toEmail, otp) {
  const fromEmail = process.env.COURIER_FROM_EMAIL || 'admin@gmail.com';
  
  try {
    const { requestId } = await courier.send({
      message: {
        to: {
          email: toEmail,
        },
        content: {
          title: '🔐 Your OTP Verification Code',
          body: `Your OTP code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, please ignore this email.`,
        },
        routing: {
          method: 'single',
          channels: ['email'],
        },
      },
    });
    
    console.log(`✅ OTP email sent to ${toEmail} via Courier | Request ID: ${requestId}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to send email to ${toEmail}:`, err.message);
    // Fallback: log OTP to console
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
