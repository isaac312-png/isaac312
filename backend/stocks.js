const { getDb } = require('./database');

function getStocks(res) {
    const db = getDb();
    db.all(`SELECT * FROM stocks`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
}
function updateStockPrices() {
    const db = getDb();
    db.all(`SELECT * FROM stocks`, (err, stocks) => {
        if (err) return;
        for (let s of stocks) {
            let change = (Math.random() - 0.5) * 0.05;
            let newPrice = Math.max(0.01, s.price * (1 + change));
            let percent = (newPrice - s.price) / s.price * 100;
            db.run(`UPDATE stocks SET price = ?, change_percent = ? WHERE id = ?`, [newPrice, percent, s.id]);
        }
    });
}
module.exports = { getStocks, updateStockPrices };