const recipeRepository = require('../../repository/recipes/recipeRepository');
const userRepository = require('../../repository/users/userRepository');
const imageService = require('../images/imageService');
const { createWorker } = require('tesseract.js');
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

class RecipeService {
  async extractTextFromImages(imageFiles) {
    const imagePartsPromises = imageFiles.map(async (file) => {
      const base64Data = await imageService.jpegToBlob(file);

      return {
        inlineData: {
          mimeType: file.mimetype || 'image/jpeg',
          data: base64Data,
        },
      };
    });

    const imageParts = await Promise.all(imagePartsPromises);

    const prompt =
      'Extract the following information from this image and return the information in a json:  "prep_time", "cook_time", "total_time", "title", "ingredients", and "instructions". Prep time, cook time, total time, and title should all be string values. Ingredients and instructions should be arrays populated with strings. Do not add any additional formatting around the json object, as the results must be formatted for my front end. It should start with { and end with }';

    const partsForGemini = [{ text: prompt }, ...imageParts];

    const result = await model.generateContent({
      contents: [
        {
          parts: partsForGemini,
        },
      ],
    });

    const response = result.response;

    return response.text();
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
