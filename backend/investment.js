const { getDb } = require('./database');
const PLAN_HOURS = { '24h':24, '48h':48, '7d':168, '30d':720, '1y':8760 };
const PROFIT_PERCENT = { '24h':0.5, '48h':1.0, '7d':2.0, '30d':5.0, '1y':12.0 };

async function startInvestment(userId, planId, amount, res) {
    const db = getDb();
    const hours = PLAN_HOURS[planId];
    const profitPercent = PROFIT_PERCENT[planId];
    if (!hours) return res.status(400).json({ error: 'Invalid plan' });
    db.get(`SELECT deposit_balance, invested_amount FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err || !user) return res.status(500).json({ error: 'User not found' });
        if (user.invested_amount > 0) return res.status(400).json({ error: 'Active investment exists' });
        if (user.deposit_balance < amount) return res.status(400).json({ error: 'Insufficient balance' });
        const endTime = Date.now() + hours * 3600000;
        const totalSeconds = hours * 3600;
        const ratePerSec = (amount * profitPercent) / totalSeconds;
        const newDepositBalance = user.deposit_balance - amount;
        db.run(`UPDATE users SET deposit_balance = ?, invested_amount = ?, investment_end_time = ?, investment_rate_per_sec = ?, active_plan = ? WHERE id = ?`,
            [newDepositBalance, amount, endTime, ratePerSec, planId, userId], (err) => {
                if (err) return res.status(500).json({ error: 'Failed' });
                res.json({ message: `Invested €${amount} in ${planId}. Profit will accumulate.` });
            });
    });
}

async function finalizeCompletedInvestments() {
    const now = Date.now();
    const db = getDb();
    db.all(`SELECT id, invested_amount, profit_accumulated, active_plan, deposit_balance FROM users WHERE invested_amount > 0 AND investment_end_time <= ?`, [now], (err, users) => {
        if (err) return console.error(err);
        for (const u of users) {
            const profitPercent = PROFIT_PERCENT[u.active_plan];
            if (!profitPercent) continue;
            const totalProfit = u.invested_amount * profitPercent;
            const newProfit = (u.profit_accumulated || 0) + totalProfit;
            const newTotal = u.deposit_balance + newProfit;
            db.run(`UPDATE users SET profit_accumulated = ?, total_balance = ?, invested_amount = 0, investment_end_time = 0, investment_rate_per_sec = 0, active_plan = NULL WHERE id = ?`,
                [newProfit, newTotal, u.id]);
        }
    });
}
module.exports = { startInvestment, finalizeCompletedInvestments };