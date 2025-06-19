const { createClient } = require('@supabase/supabase-js');

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('TEST_SUPABASE_URL:', process.env.TEST_SUPABASE_URL);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);

const supabaseUrl =
  process.env.NODE_ENV === 'test' ? process.env.TEST_SUPABASE_URL : process.env.SUPABASE_URL;

const supabaseKey =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_ANON_KEY;

console.log('Selected URL:', supabaseUrl);
console.log('Selected Key:', supabaseKey ? 'EXISTS' : 'MISSING');

if (!supabaseUrl) {
  const envType = process.env.NODE_ENV === 'test' ? 'TEST_SUPABASE_URL' : 'SUPABASE_URL';
  throw new Error(`${envType} environment variable is required`);
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
