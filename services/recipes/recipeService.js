const recipeRepository = require('../../repository/recipes/recipeRepository');
const userRepository = require('../../repository/users/userRepository');

class RecipeService {
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
