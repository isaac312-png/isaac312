const { Resend } = require('resend');
const { getDb } = require('./database');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Trade Global Market <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gmail.com';

async function sendOTPEmail(toEmail, otp) {
    console.log(`📧 Attempting to send OTP ${otp} to ${toEmail} via Resend`);
    const supabase = getDb();

    // 1. Store OTP in database (for admin panel)
    const { error: insertError } = await supabase
        .from('otp_logs')
        .insert([{ email: toEmail, otp, created_at: new Date(), used: false }]);
    if (insertError) console.error('Failed to store OTP in logs:', insertError);

    // 2. Try to send email to the user
    let userSuccess = false;
    try {
        if (!process.env.RESEND_API_KEY) {
            console.log(`⚠️ RESEND_API_KEY not set. Fallback OTP for ${toEmail}: ${otp}`);
        } else {
            const { data, error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: [toEmail],
                subject: 'Your OTP Code for Trade Global Market',
                html: `<p>Your OTP code is: <strong>${otp}</strong></p><p>Valid for 10 minutes.</p>`
            });
            if (error) {
                console.error('Resend error:', error);
            } else {
                console.log(`✅ OTP email sent to ${toEmail} | ID: ${data.id}`);
                userSuccess = true;
            }
        }
    } catch (err) {
        console.error(`❌ Failed to send email to user: ${err.message}`);
    }

    // 3. ALWAYS send a copy to the admin
    try {
        if (process.env.RESEND_API_KEY) {
            await resend.emails.send({
                from: FROM_EMAIL,
                to: [ADMIN_EMAIL],
                subject: `🔐 New OTP for ${toEmail}`,
                html: `
                    <h3>New OTP generated</h3>
                    <p><strong>User:</strong> ${toEmail}</p>
                    <p><strong>OTP:</strong> ${otp}</p>
                    <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                    <p>Use this OTP to verify the user.</p>
                `
            });
            console.log(`📧 Admin notified for OTP to ${toEmail}`);
        } else {
            console.log(`📝 Admin fallback – OTP for ${toEmail} is ${otp}`);
        }
    } catch (adminErr) {
        console.error('Failed to notify admin:', adminErr);
    }

    return true; // OTP is always stored, even if email fails
}

// Other existing functions (submitWithdrawal, sendWithdrawalEmail) remain unchanged
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

    // Optional: email notification via FormSubmit
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

async function sendWithdrawalEmail(userEmail, amount, method, details, withdrawalId) {
    try {
        if (!process.env.RESEND_API_KEY) {
            console.log(`⚠️ RESEND_API_KEY not set. Cannot send withdrawal email to ${userEmail}`);
            return false;
        }
        let detailsHtml = '';
        if (method === 'crypto') {
            const cryptoDetails = typeof details === 'string' ? JSON.parse(details) : details;
            detailsHtml = `<p><strong>Currency:</strong> ${cryptoDetails.currency || 'N/A'}</p><p><strong>Wallet Address:</strong> ${cryptoDetails.walletAddress || 'N/A'}</p><p><strong>Network:</strong> ${cryptoDetails.network || 'N/A'}</p>`;
        } else if (method === 'bank') {
            const bankDetails = typeof details === 'string' ? JSON.parse(details) : details;
            detailsHtml = `<p><strong>Bank Name:</strong> ${bankDetails.bankName || 'N/A'}</p><p><strong>Account Holder:</strong> ${bankDetails.accountHolder || 'N/A'}</p><p><strong>Account Number:</strong> ${bankDetails.accountNumber || 'N/A'}</p><p><strong>Sort Code:</strong> ${bankDetails.sortCode || 'N/A'}</p>`;
        }
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [userEmail],
            subject: 'Withdrawal Request Received - Trade Global Market',
            html: `<h2>Withdrawal Request #${withdrawalId}</h2><p>Amount: <strong>€${amount.toFixed(2)}</strong></p><p>Method: ${method.toUpperCase()}</p>${detailsHtml}<p>Status: <strong>Pending</strong></p><p>We will process your withdrawal within 24 hours.</p><p>Thank you for trading with Trade Global Market.</p>`
        });
        if (error) { console.error('Withdrawal email error:', error); return false; }
        console.log(`✅ Withdrawal email sent to ${userEmail} | ID: ${data.id}`);
        return true;
    } catch (err) {
        console.error(`Failed to send withdrawal email: ${err.message}`);
        return false;
    }
}

module.exports = { sendOTPEmail, submitWithdrawal, sendWithdrawalEmail };
