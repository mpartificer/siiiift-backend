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

  async checkUsernameAvailability(username) {
    const { data, error } = await supabase
      .from('usernames_view')
      .select('username')
      .eq('username', username)
      .single();

    if (error && error.code === 'PGRST116') {
      return null; // Username not found, so it's available
    }

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

  async getFollowers(userId) {
    const { data, error } = await supabase
      .from('user_followers_view')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data || [];
  }

  async getFollowing(userId) {
    const { data, error } = await supabase
      .from('user_following_view')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data || [];
  }

  async checkFollowing(followerId, userId) {
    const { data, error } = await supabase
      .from('user_following_view')
      .select('*')
      .eq('user_id', followerId)
      .eq('following_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return !!data;
  }

  async followUser(followerId, userId) {
    const { data, error } = await supabase
      .from('followers')
      .insert([{ follower_id: followerId, following_id: userId }]);

    if (error) throw error;
    return data;
  }

  async unfollowUser(followerId, userId) {
    const { data, error } = await supabase
      .from('followers')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', userId);

    if (error) throw error;
    return data;
  }
}

module.exports = new UserRepository();
