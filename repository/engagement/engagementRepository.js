const { supabase } = require('../../supabaseClient');

class EngagementRepository {
  async getLikesByRecipe(recipeId) {
    const { data, error } = await supabase.from('likes').select('*').eq('recipe_id', recipeId);

    if (error) throw error;

    console.log(`Found ${data.length} likes for recipe ${recipeId}`);
    return data;
  }

  async getLikesByBake(bakeId) {
    const { data, error } = await supabase.from('likes').select('*').eq('bake_id', bakeId);

    if (error) throw error;

    console.log(`Found ${data.length} likes for bake ${bakeId}`);
    return data;
  }

  async checkUserLike(userAuthId, bakeId) {
    console.log(`Checking if user ${userAuthId} liked bake ${bakeId}`);

    const { data, error } = await supabase
      .from('likes')
      .select('*')
      .eq('user_id', userAuthId)
      .eq('bake_id', bakeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log(`User ${userAuthId} has not liked bake ${bakeId}`);
        return false;
      }
      console.error(`Error checking like status:`, error);
      throw error;
    }

    console.log(`User ${userAuthId} has liked bake ${bakeId}: ${!!data}`);
    return !!data;
  }

  async addLike(userAuthId, bakeId, recipeId) {
    console.log(`Adding like for user ${userAuthId}, bake ${bakeId}, recipe ${recipeId}`);

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

    console.log(`Like added successfully`);
    return data;
  }

  async removeLike(userAuthId, bakeId) {
    console.log(`Removing like for user ${userAuthId}, bake ${bakeId}`);

    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', userAuthId)
      .eq('bake_id', bakeId);

    if (error) {
      console.error(`Error removing like:`, error);
      throw error;
    }

    console.log(`Like removed successfully`);
  }
}

module.exports = new EngagementRepository();
