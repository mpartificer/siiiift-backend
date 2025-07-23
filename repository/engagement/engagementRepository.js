const { supabase } = require('../../supabaseClient');

class EngagementRepository {
  async getLikesByRecipe(recipeId) {
    const { data, error } = await supabase.from('likes').select('*').eq('recipe_id', recipeId);

    if (error) throw error;

    return data;
  }

  async getLikesByBake(bakeId) {
    const { data, error } = await supabase.from('likes').select('*').eq('bake_id', bakeId);

    if (error) throw error;

    return data;
  }

  async checkUserLike(userAuthId, bakeId) {
    const { data, error } = await supabase
      .from('likes')
      .select('*')
      .eq('user_id', userAuthId)
      .eq('bake_id', bakeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return false;
      }
      console.error(`Error checking like status:`, error);
      throw error;
    }

    return !!data;
  }

  async addLike(userAuthId, bakeId, recipeId) {
    const { data, error } = await supabase
      .from('likes')
      .insert({
        user_id: userAuthId,
        bake_id: bakeId,
        recipe_id: recipeId,
      })
      .select();

    if (error) {
      console.error(`Error adding like:`, error);
      throw error;
    }

    return data;
  }

  async removeLike(userAuthId, bakeId) {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', userAuthId)
      .eq('bake_id', bakeId);

    if (error) {
      console.error(`Error removing like:`, error);
      throw error;
    }
  }
}

module.exports = new EngagementRepository();
