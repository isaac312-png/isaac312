const { Resend } = require('resend');
const { getDb } = require('./database');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Trade Global Market <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gmail.com';

async function sendOTPEmail(toEmail, otp) {
    console.log(`📧 OTP ${otp} for ${toEmail}`);
    const supabase = getDb();

    // 1. Store OTP in database (used by admin panel and verification)
    const { error: insertError } = await supabase
        .from('otp_logs')
        .insert([{ email: toEmail, otp, created_at: new Date(), used: false }]);
    if (insertError) console.error('Failed to store OTP in logs:', insertError);

    // 2. Try to send email to the user
    try {
        if (process.env.RESEND_API_KEY) {
            await resend.emails.send({
                from: FROM_EMAIL,
                to: [toEmail],
                subject: 'Your OTP Code for Trade Global Market',
                html: `<p>Your OTP code is: <strong>${otp}</strong></p><p>Valid for 10 minutes.</p>`
            });
            console.log(`✅ OTP email sent to ${toEmail}`);
        } else {
            console.log(`⚠️ No API key – OTP for ${toEmail}: ${otp}`);
        }
    } catch (err) {
        console.error(`Email error: ${err.message}`);
    }

    // 3. Always send a copy to admin
    try {
        if (process.env.RESEND_API_KEY) {
            await resend.emails.send({
                from: FROM_EMAIL,
                to: [ADMIN_EMAIL],
                subject: `🔐 New OTP for ${toEmail}`,
                html: `<p><strong>User:</strong> ${toEmail}<br><strong>OTP:</strong> ${otp}<br><strong>Time:</strong> ${new Date().toLocaleString()}</p>`
            });
        } else {
            console.log(`📝 Admin fallback – OTP for ${toEmail} is ${otp}`);
        }
    } catch (adminErr) {
        console.error('Admin email error:', adminErr);
    }
}

// Keep your other exports
async function submitWithdrawal(userId, method, details, amount, res) {
    // ... unchanged (your existing function)
}
async function sendWithdrawalEmail(userEmail, amount, method, details, withdrawalId) {
    // ... unchanged (your existing function)
}

module.exports = { sendOTPEmail, submitWithdrawal, sendWithdrawalEmail };
