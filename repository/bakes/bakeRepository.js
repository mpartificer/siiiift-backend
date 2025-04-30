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

  async getUsersBakes(userId) {
    const { data, error } = await supabase
      .from('bake_details_view')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data || [];
  }

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

  async getUserBakes(userId) {
    const { data, error } = await supabase
      .from('bake_details_view')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data || [];
  }

  async getHomePage() {
    const { data, error } = await supabase
      .from('bake_details_view')
      .select('*')
      .order('baked_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      return { bakeDetails: [] };
    }

    return data;
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

  async validateUser(token) {
    try {
      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data.user) {
        throw new Error('Invalid token');
      }

      return data.user;
    } catch (error) {
      throw new Error(`Authentication error: ${error.message}`);
    }
  }

  async createBake(bakeData) {
    try {
      const { data, error } = await supabase.from('Bake_Details').insert(bakeData).select();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return data[0];
    } catch (error) {
      throw error;
    }
  }

  async saveModifications({
    userId,
    bakeId,
    recipeId,
    ingredientModifications,
    instructionModifications,
  }) {
    try {
      const modificationInserts = [
        ...ingredientModifications.map((mod) => ({
          user_id: userId,
          bake_id: bakeId,
          type: 'ingredient',
          original_step_text: mod.originalIngredient,
          updated_step: mod.modifiedIngredient,
          recipe_id: recipeId,
        })),
        ...instructionModifications.map((mod) => ({
          user_id: userId,
          bake_id: bakeId,
          type: 'instruction',
          original_step_text: mod.originalInstruction,
          updated_step: mod.modifiedInstruction,
          recipe_id: recipeId,
        })),
      ];

      const { error } = await supabase.from('modifications').insert(modificationInserts);

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return true;
    } catch (error) {
      throw error;
    }
  }

  async updateBakeInsights(bakeId, insights) {
    try {
      const { data, error } = await supabase
        .from('Bake_Details')
        .update({ ai_insights: insights })
        .eq('id', bakeId)
        .select();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return data[0];
    } catch (error) {
      throw error;
    }
  }

  async getUserProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profile')
        .select('username')
        .eq('user_auth_id', userId)
        .single();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return data;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new BakeRepository();
