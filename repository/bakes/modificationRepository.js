const { supabase } = require('../../supabaseClient');

class ModificationRepository {
  async getModificationsByRecipeAndUser(recipeId, userId) {
    const { data, error } = await supabase
      .from('modifications')
      .select('*')
      .eq('recipe_id', recipeId)
      .eq('user_id', userId);

    if (error) throw error;
    return data;
  }

  async getModificationsByBake(bakeId) {
    const { data, error } = await supabase.from('modifications').select('*').eq('bake_id', bakeId);

    if (error) throw error;
    return data;
  }
}

module.exports = new ModificationRepository();
