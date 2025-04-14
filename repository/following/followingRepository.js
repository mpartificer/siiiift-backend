const { supabase } = require('../../supabaseClient');

class FollowingRepository {
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
      .from('user_following')
      .select('*')
      .eq('follower_id', followerId)
      .eq('following_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return !!data;
  }

  async followUser(followerId, userId) {
    const { data, error } = await supabase
      .from('user_following')
      .insert([{ follower_id: followerId, following_id: userId }]);

    if (error) throw error;
    return data;
  }

  async unfollowUser(followerId, userId) {
    const { data, error } = await supabase
      .from('user_following')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', userId);

    if (error) throw error;
    return data;
  }
}

module.exports = new FollowingRepository();
