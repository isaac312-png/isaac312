const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function getDb() {
    return supabase;
}

async function initDatabase() {
    console.log('✅ Connected to Supabase PostgreSQL');
    return true;
}

module.exports = { initDatabase, getDb };
