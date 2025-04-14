const bakeRepository = require('../../repository/bakes/postYourBakeRepository.js');
const fileService = require('../images/uploadImage.js');
const axios = require('axios');

const createBakePost = async (bakeData) => {
  const {
    token,
    userId,
    files,
    rating,
    bakeDate,
    recipeId,
    recipeTitle,
    ingredientModifications,
    instructionModifications,
  } = bakeData;

  try {
    const userData = await bakeRepository.validateUser(token);

    if (userData.id !== userId) {
      throw new Error('User ID mismatch');
    }

    const imageUrls = await fileService.uploadBakeImages(files);

    const bake = await bakeRepository.createBake({
      user_id: userId,
      recipe_id: recipeId,
      recipe_title: recipeTitle,
      photos: imageUrls,
      rating,
      baked_at: bakeDate,
    });

    const validIngredientMods = ingredientModifications.filter(
      (mod) => mod.originalIngredient && mod.modifiedIngredient
    );

    const validInstructionMods = instructionModifications.filter(
      (mod) => mod.originalInstruction && mod.modifiedInstruction
    );

    if (validIngredientMods.length > 0 || validInstructionMods.length > 0) {
      await bakeRepository.saveModifications({
        userId,
        bakeId: bake.id,
        recipeId,
        ingredientModifications: validIngredientMods,
        instructionModifications: validInstructionMods,
      });
    }

    const userProfile = await bakeRepository.getUserProfile(userId);

    const aiPayload = {
      imageUrls,
      recipeTitle,
      hasModifications: validIngredientMods.length > 0 || validInstructionMods.length > 0,
      originalInstructions: validInstructionMods.map((m) => m.originalInstruction),
      modifiedInstructions: validInstructionMods.map((m) => m.modifiedInstruction),
      originalIngredients: validIngredientMods.map((m) => m.originalIngredient),
      modifiedIngredients: validIngredientMods.map((m) => m.modifiedIngredient),
    };

    triggerAiAnalysis(bake.id, aiPayload, token);

    return {
      bake,
      redirectUrl: `/${userProfile.username}/${recipeId}`,
    };
  } catch (error) {
    console.error('Error in bake service:', error);
    throw new Error(`Failed to create bake post: ${error.message}`);
  }
};

const triggerAiAnalysis = (bakeId, aiPayload, token) => {
  const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/analyze-bake`;

  axios
    .post(edgeFunctionUrl, aiPayload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    .then(async (response) => {
      if (!response.data || !response.data.insights) {
        throw new Error('Invalid AI analysis response');
      }

      await bakeRepository.updateBakeInsights(bakeId, response.data.insights);

      console.log(`AI analysis completed for bake ${bakeId}`);
    })
    .catch((error) => {
      console.error('Error in AI analysis:', error);
    });
};

const updateBakeInsights = async (bakeId, insights) => {
  try {
    return await bakeRepository.updateBakeInsights(bakeId, insights);
  } catch (error) {
    console.error('Error updating bake insights:', error);
    throw new Error(`Failed to update bake insights: ${error.message}`);
  }
};

module.exports = {
  createBakePost,
  updateBakeInsights,
};
