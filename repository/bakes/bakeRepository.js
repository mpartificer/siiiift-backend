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

  async getUserBakes(userId) {
    const { data, error } = await supabase
      .from('bake_details_view')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data || [];
  }

  async getBakeById(bakeId) {
    const { data, error } = await supabase
      .from('bake_details_view')
      .select('*')
      .eq('bake_id', bakeId)
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = new BakeRepository();
