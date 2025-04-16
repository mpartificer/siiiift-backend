const { supabase } = require('../../supabaseClient');

class RecipeRepository {
  async getRecipeById(recipeId) {
    const { data, error } = await supabase
      .from('recipe_profile')
      .select('*')
      .eq('id', recipeId)
      .single();

    if (error) throw error;
    return data;
  }

  async getRecipeRatings(recipeId) {
    const { data, error } = await supabase
      .from('bake_recipe_ratings')
      .select('*')
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return data;
  }

  async getLikesByRecipeId(recipeId) {
    const { data, error, count } = await supabase
      .from('likes')
      .select('*', { count: 'exact' })
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return { data, count };
  }

  async getSavesByRecipeId(recipeId) {
    const { data, error, count } = await supabase
      .from('saves')
      .select('*', { count: 'exact' })
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return { data, count };
  }

  async getBakesByRecipeId(recipeId) {
    const { data, error, count } = await supabase
      .from('Bake_Details')
      .select('*', { count: 'exact' })
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return { data, count };
  }

  async getBakeDetailsView(recipeId) {
    const { data, error } = await supabase
      .from('bake_details_view')
      .select('*')
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return data;
  }

  async checkUserSave(userId, recipeId) {
    const { data, error } = await supabase
      .from('saves')
      .select('*')
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return false;
      }
      throw error;
    }

    return !!data;
  }

  async addSave(userId, recipeId) {
    const { data, error } = await supabase
      .from('saves')
      .insert([{ user_id: userId, recipe_id: recipeId }]);

    if (error) throw error;
    return data;
  }

  async removeSave(userId, recipeId) {
    const { error } = await supabase
      .from('saves')
      .delete()
      .eq('user_id', userId)
      .eq('recipe_id', recipeId);

    if (error) throw error;
  }
}

module.exports = new RecipeRepository();
