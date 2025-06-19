const { createClient } = require('@supabase/supabase-js');

const testSupabaseUrl = process.env.TEST_SUPABASE_URL;
const testSupabaseKey = process.env.TEST_SUPABASE_ANON_KEY;

let testSupabase;

function getTestDatabase() {
  if (!testSupabase) {
    testSupabase = createClient(testSupabaseUrl, testSupabaseKey);
  }
  return testSupabase;
}

async function clearTestData() {
  const supabase = getTestDatabase();

  await supabase.from('recipe_profile').delete().like('title', '%Test%');
}

module.exports = {
  getTestDatabase,
  clearTestData,
};
