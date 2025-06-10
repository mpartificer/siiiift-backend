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

  async createRecipe(recipeData) {
    const { data, error } = await supabase
      .from('recipe_profile')
      .insert([
        {
          title: recipeData.title,
          ingredients: recipeData.ingredients,
          instructions: recipeData.instructions,
          prep_time: recipeData.prep_time,
          cook_time: recipeData.cook_time,
          total_time: recipeData.total_time,
          original_link: recipeData.original_link,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async saveRecipeImage(recipeId, imageBase64, mimetype) {
    const buffer = Buffer.from(imageBase64, 'base64');
    const filename = `recipe_${recipeId}_${Date.now()}.${mimetype.split('/')[1]}`;

    const { data, error } = await supabase.storage.from('recipe_images').upload(filename, buffer, {
      contentType: mimetype,
      upsert: false,
    });

    if (error) throw error;

    const { data: urlData } = supabase.storage.from('recipe_images').getPublicUrl(filename);

    const { error: updateError } = await supabase
      .from('recipe_profile')
      .update({
        images: [urlData.publicUrl],
      })
      .eq('id', recipeId);

    if (updateError) throw updateError;

    return urlData.publicUrl;
  }

  async getRecipeRatings(recipeId) {
    const { data, error } = await supabase
      .from('bake_recipe_ratings')
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

  async updateRecipeImage(recipeId, imageUrl) {
    console.log(`Updating recipe ${recipeId} image to: ${imageUrl}`);

    const { data, error } = await supabase
      .from('recipe_profile')
      .update({ images: [imageUrl] })
      .eq('id', recipeId)
      .select();

    if (error) {
      console.error(`Error updating recipe image:`, error);
      throw error;
    }

    console.log(`Successfully updated recipe ${recipeId} image`);
    return data;
  }

  async getSavesByRecipeId(recipeId) {
    const { count, error } = await supabase
      .from('saves')
      .select('*', { count: 'exact', head: true })
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return { count: count || 0 };
  }

  async getLikesByRecipeId(recipeId) {
    const { count, error } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return { count: count || 0 };
  }

  async getBakesByRecipeId(recipeId) {
    const { count, error } = await supabase
      .from('Bake_Details')
      .select('*', { count: 'exact', head: true })
      .eq('recipe_id', recipeId);

    if (error) throw error;
    return { count: count || 0 };
  }

  async getBakeDetailsView(recipeId) {
    const { data, error } = await supabase
      .from('bake_details_view')
      .select('*')
      .eq('recipe_id', recipeId)
      .order('baked_at', { ascending: false });

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
