const { supabase } = require('../../supabaseClient');

class BakeRepository {
  async getBakesByUserAndRecipe(userId, recipeId) {
    const { data, error } = await supabase
      .from('Bake_Details')
      .select('*')
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)
      .order('baked_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

module.exports = new BakeRepository();
