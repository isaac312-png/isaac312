// backend/email.js
const { Resend } = require('resend');
const { getDb } = require('./database');

// Initialize Resend with your API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

// Use Resend's default test domain. You can change this later after verifying your own domain.
const FROM_EMAIL = 'Trade Global Market <onboarding@resend.dev>';

async function sendOTPEmail(toEmail, otp) {
    // Log the OTP to the console for debugging, just in case
    console.log(`Preparing to send OTP ${otp} to ${toEmail} via Resend.`);

    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [toEmail],
            subject: 'Your OTP Code for Trade Global Market',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #00cc66; text-align: center;">Your OTP Code</h2>
                    <p style="font-size: 16px; color: #333;">Hello,</p>
                    <p style="font-size: 16px; color: #333;">Your verification code is:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; background: #f0f0f0; padding: 10px 20px; border-radius: 8px;">${otp}</span>
                    </div>
                    <p style="font-size: 14px; color: #666;">This code will expire in 10 minutes.</p>
                    <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
                    <p style="font-size: 12px; color: #999; text-align: center;">Trade Global Market</p>
                </div>
            `,
        });

        if (error) {
            console.error('Error from Resend API:', error);
            return false;
        }

        console.log(`✅ OTP email sent successfully to ${toEmail}. Resend ID: ${data.id}`);
        return true;
    } catch (err) {
        console.error(`❌ Failed to send email to ${toEmail}:`, err.message);
        // Fallback: log OTP to console so you can still test manually
        console.log(`📝 FALLBACK OTP for ${toEmail}: ${otp}`);
        return false;
    }
}

// ... (Keep the submitWithdrawal function exactly as it is in your current file)
async function submitWithdrawal(userId, method, details, amount, res) {
    // ... your existing code ...
}

module.exports = { sendOTPEmail, submitWithdrawal };
