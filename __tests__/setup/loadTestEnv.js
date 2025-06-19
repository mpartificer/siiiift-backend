const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.test') });

console.log('Test env loaded. NODE_ENV:', process.env.NODE_ENV);
console.log('TEST_SUPABASE_URL loaded:', !!process.env.TEST_SUPABASE_URL);
