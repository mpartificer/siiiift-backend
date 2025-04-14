const { supabase } = require('../../supabaseClient');

class UserRepository {
  async getUserByUsername(username) {
    const { data, error } = await supabase
      .from('user_profile')
      .select('*')
      .eq('username', username)
      .single();

    if (error) throw error;
    return data;
  }

  async getUserById(userId) {
    const { data, error } = await supabase
      .from('user_profile')
      .select('*')
      .eq('user_auth_id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  async getCurrentUser() {
    throw new Error('getCurrentUser method should not be called directly');
  }
}

module.exports = new UserRepository();
