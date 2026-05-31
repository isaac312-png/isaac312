const { getDb } = require('./database');

const PLAN_HOURS = {
    '24h': 24,
    '48h': 48,
    '7d': 168,
    '30d': 720,
    '1y': 8760
};
const PROFIT_PERCENT = {
    '24h': 0.5,
    '48h': 1.0,
    '7d': 2.0,
    '30d': 5.0,
    '1y': 12.0
};

async function startInvestment(userId, planId, amount, res) {
    const supabase = getDb();
    const hours = PLAN_HOURS[planId];
    const profitPercent = PROFIT_PERCENT[planId];
    if (!hours || profitPercent === undefined) {
        return res.status(400).json({ error: 'Invalid plan' });
    }

    const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('deposit_balance, invested_amount')
        .eq('id', userId)
        .single();

    if (fetchError || !user) {
        return res.status(500).json({ error: 'User not found' });
    }
    if (user.invested_amount > 0) {
        return res.status(400).json({ error: 'Already have an active investment' });
    }
    if (user.deposit_balance < amount) {
        return res.status(400).json({ error: 'Insufficient deposit balance' });
    }

    const endTime = Date.now() + hours * 60 * 60 * 1000;
    const totalSeconds = hours * 3600;
    const ratePerSec = (amount * profitPercent) / totalSeconds;
    const newDepositBalance = user.deposit_balance - amount;

    const { error: updateError } = await supabase
        .from('users')
        .update({
            deposit_balance: newDepositBalance,
            invested_amount: amount,
            investment_end_time: endTime,
            investment_rate_per_sec: ratePerSec,
            active_plan: planId
        })
        .eq('id', userId);

    if (updateError) {
        console.error('Investment start error:', updateError);
        return res.status(500).json({ error: 'Failed to start investment' });
    }
    res.json({ message: `Invested €${amount.toFixed(2)} in ${planId} plan. Profit will accumulate over ${hours} hours.` });
}

async function finalizeCompletedInvestments() {
    const supabase = getDb();
    const now = Date.now();

    const { data: users, error } = await supabase
        .from('users')
        .select('id, invested_amount, profit_accumulated, active_plan, deposit_balance')
        .gt('invested_amount', 0)
        .lt('investment_end_time', now);

    if (error) {
        console.error('finalizeCompletedInvestments error:', error);
        return;
    }

    for (const user of users) {
        const profitPercent = PROFIT_PERCENT[user.active_plan];
        if (!profitPercent) continue;
        const totalProfit = user.invested_amount * profitPercent;
        const newProfitBalance = (user.profit_accumulated || 0) + totalProfit;
        const newTotalBalance = user.deposit_balance + newProfitBalance;

        const { error: updateError } = await supabase
            .from('users')
            .update({
                profit_accumulated: newProfitBalance,
                total_balance: newTotalBalance,
                invested_amount: 0,
                investment_end_time: 0,
                investment_rate_per_sec: 0,
                active_plan: null
            })
            .eq('id', user.id);

        if (updateError) {
            console.error(`Failed to finalize investment for user ${user.id}:`, updateError);
        } else {
            console.log(`User ${user.id} completed investment, profit added: ${totalProfit}`);
        }
    }
}

module.exports = { startInvestment, finalizeCompletedInvestments };
