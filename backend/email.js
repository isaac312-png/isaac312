const { Resend } = require('resend');
const { getDb } = require('./database');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Trade Global Market <onboarding@resend.dev>';

async function sendOTPEmail(toEmail, otp) {
    console.log(`📧 Attempting to send OTP ${otp} to ${toEmail} via Resend`);
    try {
        if (!process.env.RESEND_API_KEY) {
            console.log(`⚠️ RESEND_API_KEY not set. Fallback OTP for ${toEmail}: ${otp}`);
            return false;
        }
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [toEmail],
            subject: 'Your OTP Code for Trade Global Market',
            html: `<p>Your OTP code is: <strong>${otp}</strong></p><p>Valid for 10 minutes.</p>`
        });
        if (error) {
            console.error('Resend error:', error);
            console.log(`📝 Fallback OTP for ${toEmail}: ${otp}`);
            return false;
        }
        console.log(`✅ OTP email sent to ${toEmail} | ID: ${data.id}`);
        return true;
    } catch (err) {
        console.error(`❌ Failed to send email: ${err.message}`);
        console.log(`📝 Fallback OTP for ${toEmail}: ${otp}`);
        return false;
    }
}

async function submitWithdrawal(userId, method, details, amount, res) {
    const supabase = getDb();
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();

    if (userError || !user) {
        return res.status(500).json({ error: 'User not found' });
    }

    const { error: insertError } = await supabase
        .from('withdrawals')
        .insert([{
            user_id: userId,
            method,
            details: JSON.stringify(details),
            amount,
            status: 'pending',
            created_at: Date.now()
        }]);

    if (insertError) {
        console.error('Withdrawal insert error:', insertError);
        return res.status(500).json({ error: 'Failed to record withdrawal' });
    }

    // Optional: email notification to operator via FormSubmit
    if (process.env.FORMSUBMIT_URL) {
        const fetch = require('node-fetch');
        fetch(process.env.FORMSUBMIT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'withdrawal', user_email: user.email, amount, method, details })
        }).catch(e => console.error('FormSubmit error', e));
    }
    res.json({ message: 'Withdrawal request recorded. Funds will be sent within 24 hours.' });
}

module.exports = { sendOTPEmail, submitWithdrawal };
