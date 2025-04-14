const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const validateUser = async (token) => {
  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new Error('Invalid token');
    }

    return data.user;
  } catch (error) {
    throw new Error(`Authentication error: ${error.message}`);
  }
};

const createBake = async (bakeData) => {
  try {
    const { data, error } = await supabase.from('Bake_Details').insert(bakeData).select();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return data[0];
  } catch (error) {
    throw error;
  }
};

const saveModifications = async ({
  userId,
  bakeId,
  recipeId,
  ingredientModifications,
  instructionModifications,
}) => {
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
};

const updateBakeInsights = async (bakeId, insights) => {
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
};

const getUserProfile = async (userId) => {
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
};

module.exports = {
  validateUser,
  createBake,
  saveModifications,
  updateBakeInsights,
  getUserProfile,
};
