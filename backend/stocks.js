const { getDb } = require('./database');

async function getStocks(res) {
    const supabase = getDb();
    const { data, error } = await supabase.from('stocks').select('*');
    if (error) {
        console.error('Stocks error:', error);
        return res.status(500).json({ error: 'Database error' });
    }
    res.json(data);
}

async function updateStockPrices() {
    const supabase = getDb();
    const { data: stocks, error } = await supabase.from('stocks').select('*');
    if (error) return console.error('Update stocks select error:', error);

    for (let stock of stocks) {
        let change = (Math.random() - 0.5) * 0.05; // -2.5% to +2.5%
        let newPrice = Math.max(0.01, stock.price * (1 + change));
        let changePercent = (newPrice - stock.price) / stock.price * 100;
        const { error: updateError } = await supabase
            .from('stocks')
            .update({ price: newPrice, change_percent: changePercent })
            .eq('id', stock.id);
        if (updateError) console.error(`Update stock ${stock.symbol} error:`, updateError);
    }
}

module.exports = { getStocks, updateStockPrices };
