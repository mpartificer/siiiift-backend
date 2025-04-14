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

  async getUserProfile(userId) {
    return this.getUserById(userId);
  }

  async getCurrentUser() {
    throw new Error('getCurrentUser method should not be called directly');
  }

  async searchUsers(searchTerm) {
    const { data, error } = await supabase
      .from('user_profile')
      .select('*')
      .ilike('username', `%${searchTerm}%`)
      .limit(10);

    if (error) throw error;
    return data || [];
  }

  async updateUserProfile(userId, profileData) {
    const { data, error } = await supabase
      .from('user_profile')
      .update(profileData)
      .eq('user_auth_id', userId);

    if (error) throw error;
    return data;
  }
}

module.exports = new UserRepository();
