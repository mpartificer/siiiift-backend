const bakeRepository = require('../../repository/bakes/bakeRepository');
const engagementRepository = require('../../repository/engagement/engagementRepository');
const userRepository = require('../../repository/users/userRepository');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const imageBlobMaker = require('../images/imageService.js');
const fileService = require('../images/uploadImage.js');
const axios = require('axios');
const Bottleneck = require('bottleneck');

const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

const supabaseEdgeLimiter = new Bottleneck({
  reservoir: 10,
  reservoirRefreshAmount: 10,
  reservoirRefreshInterval: 60 * 1000,
  maxConcurrent: 3,
});

supabaseEdgeLimiter.on('received', (info) => {
  console.log(
    `Bottleneck: Request received. Queue size: ${supabaseEdgeLimiter.queued}, Running: ${supabaseEdgeLimiter.running}`
  );
});

supabaseEdgeLimiter.on('done', (info) => {
  console.log(
    `Bottleneck: Request completed. Queue size: ${supabaseEdgeLimiter.queued}, Running: ${supabaseEdgeLimiter.running}`
  );
});

class BakeService {
  async createBakePost(bakeData) {
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

      const { validIngredientMods, validInstructionMods } = await this.setModifications(
        ingredientModifications,
        instructionModifications,
        userId,
        bake,
        recipeId
      );

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

      this.triggerAiAnalysis(bake.id, aiPayload, token);

      return {
        bake,
        redirectUrl: `/${userProfile.username}/${recipeId}`,
      };
    } catch (error) {
      console.error('Error in bake service:', error);
      throw new Error(`Failed to create bake post: ${error.message}`);
    }
  }

  async setModifications(
    ingredientModifications,
    instructionModifications,
    userId,
    bake,
    recipeId
  ) {
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

    return {
      validIngredientMods,
      validInstructionMods,
    };
  }

  async triggerAiAnalysis(bakeId, aiPayload, token) {
    const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/analyze-bake`;

    const rateLimitedAnalysis = supabaseEdgeLimiter.wrap(async () => {
      try {
        console.log(`Triggering AI analysis for bake ${bakeId} with payload:`, {
          imageCount: aiPayload.imageUrls.length,
          recipeTitle: aiPayload.recipeTitle,
          hasModifications: aiPayload.hasModifications,
        });

        const response = await axios.post(edgeFunctionUrl, aiPayload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        console.log(`AI analysis response status: ${response.status}`);

        if (!response.data || !response.data.insights) {
          console.error('Invalid or empty AI analysis response:', response.data);
          throw new Error('Invalid AI analysis response');
        }

        console.log(`Received AI insights. Updating bake ${bakeId}`);

        await bakeRepository.updateBakeInsights(bakeId, response.data.insights);

        console.log(`AI analysis completed and insights stored for bake ${bakeId}`);
        return true;
      } catch (error) {
        console.error(`Error in AI analysis for bake ${bakeId}:`, error);
        console.error('Error details:', error.response?.data || error.message);

        if (error.response?.status === 429) {
          console.log(`Rate limit hit for bake ${bakeId}, will retry automatically`);
          throw new Error('Rate limit exceeded - request will be retried');
        }

        return false;
      }
    });

    try {
      return await rateLimitedAnalysis();
    } catch (error) {
      console.error(`Rate-limited AI analysis failed for bake ${bakeId}:`, error);
      return false;
    }
  }

  async updateBakeInsights(bakeId, insights) {
    try {
      return await bakeRepository.updateBakeInsights(bakeId, insights);
    } catch (error) {
      console.error('Error updating bake insights:', error);
      throw new Error(`Failed to update bake insights: ${error.message}`);
    }
  }

  async analyzeImage(imageUrls) {
    const imageAnalysisPromises = imageUrls.map(async (url) => {
      const imageData = await imageBlobMaker.getImageAsBase64(url);

      const prompt =
        'Analyze this baked good in detail. Assess the texture, color, shape, and overall appearance. Note any visible characteristics that might indicate potential improvements.';

      const result = await model.generateContent({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageData,
                },
              },
            ],
          },
        ],
      });

      const response = result.response;
      return response.text();
    });

    const imageAnalyses = await Promise.all(imageAnalysisPromises);
    const imageInsights = imageAnalyses.join('\n');

    return imageInsights;
  }

  async getRecipePrompt(
    hasModifications,
    originalInstructions,
    originalIngredients,
    modifiedIngredients,
    modifiedInstructions,
    recipeTitle
  ) {
    let recipePrompt;

    if (hasModifications && originalInstructions.length > 0 && originalIngredients.length > 0) {
      recipePrompt = `Analyze this bake of "${recipeTitle}" with the following modifications:
      
      Original Ingredients: ${JSON.stringify(originalIngredients)}
      Modified Ingredients: ${JSON.stringify(modifiedIngredients)}
      
      Original Instructions: ${JSON.stringify(originalInstructions)}
      Modified Instructions: ${JSON.stringify(modifiedInstructions)}
      
      Evaluate how these modifications might have affected the final result and what improvements could be made.`;
    } else {
      recipePrompt = `Analyze this bake of "${recipeTitle}".
      No modifications were made to the original recipe.
      Based on the visual analysis, what techniques could be improved and what modifications might enhance the result?`;
    }

    return recipePrompt;
  }

  async getFinalPrompt(recipeTitle, hasModifications, imageInsights, recipeInsights) {
    const finalPrompt = `You are providing feedback on a user's bake of "${recipeTitle}". 
    Based on my analysis of the provided image(s) and ${hasModifications ? 'the recipe modifications they made' : 'the original recipe execution'}:

    Image Analysis I Just Performed:
    ${imageInsights}

    Recipe Analysis I Just Performed:
    ${recipeInsights}

    Now, synthesize a helpful response to the user. Start with a brief comment about what you see in their bake photos.
    Then provide clear, specific, and actionable insights for their next attempt. Include:
    1. Technique improvements based on what you observe in their photos
    2. ${hasModifications ? 'Suggestions to refine their modifications' : 'Potential beneficial modifications they could try'}
    3. Specific tips for achieving better results

    Keep the response friendly and constructive. Avoid referring to any "analysis" - instead, directly reference what you see in their photos.
    Focus on giving them practical advice for their next bake.`;

    return finalPrompt;
  }

  async analyzeRecipe(recipePrompt) {
    const recipeResult = await model.generateContent(recipePrompt);
    const recipeResponse = recipeResult.response;
    const recipeInsights = recipeResponse.text();

    return recipeInsights;
  }

  async analyzeBake(analysisData) {
    const {
      imageUrls,
      recipeTitle,
      hasModifications,
      originalInstructions,
      modifiedInstructions,
      originalIngredients,
      modifiedIngredients,
    } = analysisData;

    try {
      const imageInsights = await this.analyzeImage(imageUrls);

      const recipePrompt = await this.getRecipePrompt(
        hasModifications,
        originalInstructions,
        originalIngredients,
        modifiedIngredients,
        modifiedInstructions,
        recipeTitle
      );

      const recipeInsights = await this.analyzeRecipe(recipePrompt);

      const finalPrompt = await this.getFinalPrompt(
        recipeTitle,
        hasModifications,
        imageInsights,
        recipeInsights
      );
      const finalResult = await model.generateContent(finalPrompt);
      const finalResponse = finalResult.response;

      return finalResponse.text();
    } catch (error) {
      console.error('Error in bake analysis service:', error);
      throw new Error(`Failed to analyze bake: ${error.message}`);
    }
  }

  async getBakeHistory(username, recipeId, currentUserAuthId) {
    try {
      console.log(
        `Getting bake history for ${username}, recipe ${recipeId}, current user auth ID ${currentUserAuthId || 'guest'}`
      );

      const userData = await userRepository.getUserByUsername(username);

      if (!userData || !userData.user_auth_id) {
        throw new Error(`No user found for username: ${username}`);
      }

      const [bakeDetails, likeDetails, modificationDetails] = await Promise.all([
        bakeRepository.getBakesByUserAndRecipe(userData.user_auth_id, recipeId),
        engagementRepository.getLikesByRecipe(recipeId),
        bakeRepository.getModificationsByRecipeAndUser(recipeId, userData.user_auth_id),
      ]);

      let currentUserData = null;
      if (currentUserAuthId) {
        try {
          currentUserData = await userRepository.getUserById(currentUserAuthId);
          console.log(`Found current user data for ${currentUserAuthId}: ${!!currentUserData}`);
        } catch (e) {
          console.error(`Error fetching current user data: ${e.message}`);
        }
      }

      const currentUserDetails = {
        data: {
          user: currentUserData
            ? {
                user_auth_id: currentUserData.user_auth_id,
                id: currentUserData.user_auth_id,
                username: currentUserData.username,
                ...currentUserData,
              }
            : null,
        },
      };

      console.log(`Current user details:`, {
        hasUser: !!currentUserDetails.data.user,
        userAuthId: currentUserDetails.data.user?.user_auth_id || 'none',
      });

      return {
        profileData: userData,
        bakeDetails,
        likeDetails,
        modificationDetails,
        currentUserDetails,
      };
    } catch (error) {
      console.error('Error in getBakeHistory:', error);
      throw error;
    }
  }

  async getHomeFeed(currentUserAuthId) {
    try {
      console.log(`Getting home feed for user auth ID ${currentUserAuthId || 'guest'}`);

      const data = await bakeRepository.getHomePage();

      return {
        bakeDetails: data,
        currentUserId: currentUserAuthId,
      };
    } catch (error) {
      console.error('Error in getHomeFeed:', error);
      throw error;
    }
  }

  async getUsersBakes(userId) {
    try {
      const usersBakes = await bakeRepository.getUsersBakes(userId);

      return usersBakes;
    } catch (error) {
      console.error('Error retrieving User Bakes');
    }
  }
}

module.exports = new BakeService();
