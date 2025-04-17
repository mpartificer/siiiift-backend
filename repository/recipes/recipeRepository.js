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
      .from('recipe_ratings')
      .select('*')
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return data || [];
  }

  async getSavesByUserId(userId) {
    const { data, error } = await supabase.from('saves_view').select('*').eq('user_id', userId);

    if (error) throw error;
    return data || [];
  }

  async getSavesByRecipeId(recipeId) {
    const { count, error } = await supabase
      .from('user_recipe_saves')
      .select('*', { count: 'exact', head: true })
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return { count: count || 0 };
  }

  async getLikesByRecipeId(recipeId) {
    const { count, error } = await supabase
      .from('user_recipe_likes')
      .select('*', { count: 'exact', head: true })
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return { count: count || 0 };
  }

  async getBakesByRecipeId(recipeId) {
    const { count, error } = await supabase
      .from('user_bakes')
      .select('*', { count: 'exact', head: true })
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return { count: count || 0 };
  }

  async getBakeDetailsView(recipeId) {
    const { data, error } = await supabase
      .from('user_bakes_details_view')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async checkUserSave(userId, recipeId) {
    const { data, error } = await supabase
      .from('saves')
      .select('*')
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)
      .single();

    if (error && error.code !== 'PGRST116') {
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
    const { data, error } = await supabase
      .from('saves')
      .delete()
      .eq('user_id', userId)
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return data;
  }

  async searchRecipes(searchTerm) {
    const { data, error } = await supabase
      .from('recipe_profile')
      .select('id, title, images')
      .ilike('title', `%${searchTerm}%`)
      .limit(10);

    if (error) throw error;
    return data || [];
  }
}

module.exports = new RecipeRepository();
