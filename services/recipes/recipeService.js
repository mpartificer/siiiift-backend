const recipeRepository = require('../../repository/recipes/recipeRepository');
const userRepository = require('../../repository/users/userRepository');
const imageService = require('../images/imageService');
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Bottleneck = require('bottleneck');
require('dotenv').config();

const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const geminiRecipeLimiter = new Bottleneck({
  reservoir: 15,
  reservoirRefreshAmount: 15,
  reservoirRefreshInterval: 60 * 1000,
  maxConcurrent: 2,
  minTime: 2000,
});

geminiRecipeLimiter.on('received', (info) => {
  console.log(
    `Recipe AI: Request received. Queue=${geminiRecipeLimiter.queued()}, Running=${geminiRecipeLimiter.running()}, Reservoir=${geminiRecipeLimiter.reservoir()}`
  );
});

geminiRecipeLimiter.on('done', (info) => {
  console.log(
    `Recipe AI: Request completed. Queue=${geminiRecipeLimiter.queued()}, Running=${geminiRecipeLimiter.running()}, Reservoir=${geminiRecipeLimiter.reservoir()}`
  );
});

function logMemoryUsage(label) {
  const usage = process.memoryUsage();
  console.log(`=== MEMORY [${label}] ===`);
  console.log(`RSS: ${(usage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Used: ${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Total: ${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`External: ${(usage.external / 1024 / 1024).toFixed(2)} MB`);
  console.log(`========================`);
}

function forceGC() {
  if (global.gc) {
    global.gc();
    console.log('🗑️  Forced garbage collection');
  }
}

class RecipeService {
  async extractTextFromImages(imageFiles) {
    logMemoryUsage('START - extractTextFromImages');
    console.log(`Processing ${imageFiles.length} recipe images with OPTIMIZED AI extraction`);

    const totalInitialSize = imageFiles.reduce((sum, file) => sum + file.buffer.length, 0);
    console.log(`Total input image size: ${(totalInitialSize / 1024 / 1024).toFixed(2)} MB`);

    const imageParts = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      console.log(`\n=== PROCESSING IMAGE ${i + 1}/${imageFiles.length} SEQUENTIALLY ===`);
      logMemoryUsage(`Before processing image ${i + 1}`);

      try {
        const processedImagePart = await this.processSingleImageOptimized(file, i + 1);
        imageParts.push(processedImagePart);

        forceGC();
        logMemoryUsage(`After processing image ${i + 1} (with cleanup)`);
      } catch (error) {
        console.error(`Error processing image ${i + 1}:`, error);
        const base64Data = file.buffer.toString('base64');
        imageParts.push({
          inlineData: {
            mimeType: file.mimetype || 'image/jpeg',
            data: base64Data,
          },
        });
      }
    }

    const totalAIPayloadSize = imageParts.reduce((sum, part) => {
      return sum + (part.inlineData.data.length || 0);
    }, 0);
    console.log(`Total AI payload size: ${(totalAIPayloadSize / 1024 / 1024).toFixed(2)} MB`);

    const prompt =
      'Extract the following information from this image and return the information in a json: "prep_time", "cook_time", "total_time", "title", "ingredients", and "instructions". Prep time, cook time, total time, and title should all be string values. Ingredients and instructions should be arrays populated with strings. Do not add any additional formatting around the json object, as the results must be formatted for my front end. It should start with { and end with }';

    const partsForGemini = [{ text: prompt }, ...imageParts];

    console.log(`Calling Gemini AI with ${imageParts.length} processed images...`);
    logMemoryUsage('Before Gemini AI call');

    const rateLimitedAICall = geminiRecipeLimiter.wrap(async () => {
      console.log(`Executing rate-limited Gemini AI call for recipe extraction...`);

      try {
        const result = await model.generateContent({
          contents: [{ parts: partsForGemini }],
        });

        console.log(`🤖 Gemini AI call completed successfully`);
        return result.response.text();
      } catch (error) {
        console.error(`Error in Gemini AI call:`, error);

        if (error.message?.includes('rate limit') || error.status === 429) {
          console.log(`Google rate limit hit, will retry automatically`);
          throw new Error('Google API rate limit exceeded - request will be retried');
        }

        throw error;
      }
    });

    try {
      const aiResult = await rateLimitedAICall();

      logMemoryUsage('After Gemini AI call');
      console.log(`AI processing complete!`);
      logMemoryUsage('END - extractTextFromImages');

      return aiResult;
    } catch (error) {
      console.error(`Rate-limited AI call failed:`, error);
      logMemoryUsage('ERROR - extractTextFromImages');
      throw new Error(`Failed to extract recipe from images: ${error.message}`);
    }
  }

  async processSingleImageOptimized(file, imageIndex) {
    console.log(`Processing image ${imageIndex}: ${file.originalname}`);
    console.log(`Image size: ${(file.buffer.length / 1024 / 1024).toFixed(2)} MB`);

    try {
      const optimizedBuffer = await this.createOptimizedVersion(file.buffer, file.mimetype);

      console.log(`Optimized buffer size: ${(optimizedBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      logMemoryUsage(`After optimization - image ${imageIndex}`);

      const processedFile = {
        buffer: optimizedBuffer,
        mimetype: file.mimetype || 'image/jpeg',
      };

      const base64Data = await imageService.jpegToBlob(processedFile);
      console.log(`Base64 size: ${(base64Data.length / 1024 / 1024).toFixed(2)} MB`);

      return {
        inlineData: {
          mimeType: file.mimetype || 'image/jpeg',
          data: base64Data,
        },
      };
    } catch (error) {
      console.error(`Error in optimized processing for image ${imageIndex}:`, error);
      throw error;
    }
  }

  async createOptimizedVersion(imageBuffer, mimeType) {
    console.log('  → Creating SINGLE optimized version');
    console.log(`    Input: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    logMemoryUsage('Before single optimization');

    try {
      const processedBuffer = await sharp(imageBuffer)
        .resize({
          width: 1200,
          height: 1600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .normalize()
        .modulate({
          brightness: 1.05,
          contrast: 1.2,
        })
        .sharpen()
        .jpeg({ quality: 85 })
        .toBuffer();

      logMemoryUsage('After single optimization');
      console.log(
        `    Optimized: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB -> ${(processedBuffer.length / 1024 / 1024).toFixed(2)} MB`
      );

      return processedBuffer;
    } catch (error) {
      console.error('    Error in optimization:', error);
      logMemoryUsage('Error during optimization');

      try {
        const fallbackBuffer = await sharp(imageBuffer)
          .resize({
            width: 800,
            height: 1000,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80 })
          .toBuffer();

        console.log('    Used fallback optimization');
        return fallbackBuffer;
      } catch (fallbackError) {
        console.error('    Fallback also failed, using original');
        return imageBuffer;
      }
    }
  }

  async storeRecipe(userId, recipeData) {
    console.log(`Saving recipe for user ${userId}`);

    try {
      const recipeToSave = {
        title: recipeData.title || 'Untitled Recipe',
        ingredients: recipeData.ingredients,
        instructions: recipeData.instructions,
        prep_time: recipeData.prep_time,
        cook_time: recipeData.cook_time,
        total_time: recipeData.total_time,
        original_link: recipeData.original_link || 'Unknown',
      };

      const savedRecipe = await recipeRepository.createRecipe(recipeToSave);

      if (recipeData.defaultImage && recipeData.defaultImage.buffer) {
        await recipeRepository.saveRecipeImage(
          savedRecipe.id,
          recipeData.defaultImage.buffer,
          recipeData.defaultImage.mimetype
        );
      }

      console.log(`Recipe saved successfully with ID: ${savedRecipe.id}`);
      return savedRecipe;
    } catch (error) {
      console.error('Error saving recipe:', error);
      throw error;
    }
  }

  async getRecipeDetails(recipeId) {
    try {
      console.log(`Getting recipe details for recipe ${recipeId}`);
      const recipeDetails = await recipeRepository.getRecipeById(recipeId);
      console.log(`Retrieved recipe details for ${recipeId}`);
      return recipeDetails;
    } catch (error) {
      console.error(`Error getting recipe details:`, error);
      throw error;
    }
  }

  async updateRecipeImage(recipeId, imageUrl) {
    console.log('=== SERVICE: updateRecipeImage called ===');
    console.log('Recipe ID:', recipeId);
    console.log('Image URL:', imageUrl);

    try {
      console.log('Calling repository.updateRecipeImage...');
      const updatedRecipe = await recipeRepository.updateRecipeImage(recipeId, imageUrl);
      console.log('Repository returned:', updatedRecipe);
      return updatedRecipe;
    } catch (error) {
      console.error('=== SERVICE ERROR ===');
      console.error('Error in updateRecipeImage service:', error);
      throw error;
    }
  }

  async getRecipeRatings(recipeId) {
    try {
      console.log(`Getting ratings for recipe ${recipeId}`);
      const ratings = await recipeRepository.getRecipeRatings(recipeId);
      console.log(`Retrieved ratings for recipe ${recipeId}`);
      return ratings;
    } catch (error) {
      console.error(`Error getting recipe ratings:`, error);
      throw error;
    }
  }

  async getRecipeBox(userId) {
    const userDetails = await userRepository.getUserById(userId);
    const savedRecipes = await recipeRepository.getSavesByUserId(userId);

    return {
      ...userDetails,
      savedRecipes,
    };
  }

  async getSavesByUserId(userId) {
    try {
      console.log(`Getting saves by user ${userId}`);
      const savedRecipes = await recipeRepository.getSavesByUserId(userId);
      console.log(`Retrieved saves for user ${userId}`);
      return savedRecipes;
    } catch (error) {
      console.error(`Error getting recipe saves:`, error);
      throw error;
    }
  }

  async getRecipeDropdownData(userId) {
    try {
      console.log(`Getting recipe dropdown data for user ${userId}`);
      const savedRecipes = await recipeRepository.getSavesByUserId(userId);

      const formattedRecipes = savedRecipes.map((recipe) => ({
        recipe_id: recipe.recipe_id,
        recipe_title: recipe.recipe_title,
      }));

      console.log(`Retrieved ${formattedRecipes.length} recipes for dropdown`);
      return formattedRecipes;
    } catch (error) {
      console.error(`Error getting recipe dropdown data:`, error);
      throw error;
    }
  }

  async getRecipeStats(recipeId) {
    try {
      console.log(`Getting stats for recipe ${recipeId}`);

      const [likesResponse, savesResponse, bakesResponse] = await Promise.all([
        recipeRepository.getLikesByRecipeId(recipeId),
        recipeRepository.getSavesByRecipeId(recipeId),
        recipeRepository.getBakesByRecipeId(recipeId),
      ]);

      console.log(`Retrieved stats for recipe ${recipeId}`);

      return {
        likesCount: likesResponse.count || 0,
        savesCount: savesResponse.count || 0,
        bakesCount: bakesResponse.count || 0,
      };
    } catch (error) {
      console.error(`Error getting recipe stats:`, error);
      throw error;
    }
  }

  async getBakesList(recipeId) {
    try {
      console.log(`Getting bakes list for recipe ${recipeId}`);
      const bakes = await recipeRepository.getBakeDetailsView(recipeId);
      console.log(`Retrieved ${bakes.length} bakes for recipe ${recipeId}`);
      return bakes;
    } catch (error) {
      console.error(`Error getting bakes list:`, error);
      throw error;
    }
  }

  async toggleSave(userId, recipeId) {
    try {
      console.log(`Toggling save for user ${userId}, recipe ${recipeId}`);

      const isSaved = await recipeRepository.checkUserSave(userId, recipeId);
      console.log(`Current save status: ${isSaved}`);

      if (isSaved) {
        console.log(`Removing save for user ${userId}, recipe ${recipeId}`);
        await recipeRepository.removeSave(userId, recipeId);

        const { count: saveCount } = await recipeRepository.getSavesByRecipeId(recipeId);
        console.log(`New save count after removing: ${saveCount}`);

        return {
          isSaved: false,
          saveCount,
        };
      } else {
        console.log(`Adding save for user ${userId}, recipe ${recipeId}`);
        await recipeRepository.addSave(userId, recipeId);

        const { count: saveCount } = await recipeRepository.getSavesByRecipeId(recipeId);
        console.log(`New save count after adding: ${saveCount}`);

        return {
          isSaved: true,
          saveCount,
        };
      }
    } catch (error) {
      console.error(`Error toggling save:`, error);
      throw error;
    }
  }

  async checkUserSave(userId, recipeId) {
    try {
      console.log(`Checking if user ${userId} has saved recipe ${recipeId}`);
      const isSaved = await recipeRepository.checkUserSave(userId, recipeId);
      console.log(`User ${userId} has saved recipe ${recipeId}: ${isSaved}`);
      return isSaved;
    } catch (error) {
      console.error(`Error checking user save:`, error);
      throw error;
    }
  }

  async searchRecipes(searchTerm) {
    try {
      console.log(`Searching for recipes with term: ${searchTerm}`);
      const recipes = await recipeRepository.searchRecipes(searchTerm);

      const formattedRecipes = recipes.map((recipe) => ({
        id: recipe.id,
        recipeId: recipe.id,
        title: recipe.title,
        images: recipe.images,
        type: 'recipe',
      }));

      console.log(`Found ${formattedRecipes.length} recipes matching '${searchTerm}'`);
      return formattedRecipes;
    } catch (error) {
      console.error(`Error searching recipes:`, error);
      throw new Error(`Failed to search recipes: ${error.message}`);
    }
  }
}

module.exports = new RecipeService();
