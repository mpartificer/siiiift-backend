const recipeRepository = require('../../repository/recipes/recipeRepository');
const userRepository = require('../../repository/users/userRepository');
const { createWorker } = require('tesseract.js');

class RecipeService {
  async analyzeRecipeImages(images) {
    console.log(`Analyzing ${images.length} recipe images`);

    let combinedText = '';

    console.log('Tesseract.js Debug:');
    console.log('- createWorker type:', typeof createWorker);

    if (images.length > 0) {
      console.log('- Image info:');
      console.log('  - mimetype:', images[0].mimetype);
      console.log('  - buffer type:', typeof images[0].buffer);
      console.log('  - buffer is Buffer:', Buffer.isBuffer(images[0].buffer));
      console.log('  - buffer length:', images[0].buffer.length);
    }

    try {
      console.log('- Creating Tesseract worker...');
      const worker = await createWorker('eng');
      console.log('- Worker created successfully');

      for (const image of images) {
        console.log(`- Processing image: ${image.originalname}`);

        console.log('  - Detailed image info:');
        console.log('    - Original name:', image.originalname);
        console.log('    - MIME type:', image.mimetype);
        console.log('    - Buffer length:', image.buffer.length);

        try {
          console.log('  - Calling worker.recognize()...');

          const result = await worker.recognize(image.buffer);

          console.log('  - Recognition completed successfully');
          console.log('  - Result type:', typeof result);

          if (result && typeof result === 'object') {
            if (result.text) {
              console.log('  - Text field found in result');
              console.log('  - Text length:', result.text.length);
              console.log('  - First 100 chars:', result.text.substring(0, 100));
              combinedText += result.text + '\n\n';
            } else if (result.data && result.data.text) {
              console.log('  - Text field found in result.data');
              console.log('  - Text length:', result.data.text.length);
              console.log('  - First 100 chars:', result.data.text.substring(0, 100));
              combinedText += result.data.text + '\n\n';
            } else {
              console.log('  - No text found in result:', Object.keys(result));
              if (result.data) {
                console.log('  - result.data keys:', Object.keys(result.data));
              }
            }
          } else {
            console.log('  - Unexpected result type:', typeof result);
          }
        } catch (recognizeError) {
          console.error('  - Recognition error:', recognizeError);
        }
      }

      console.log('- Terminating worker...');
      if (worker && typeof worker.terminate === 'function') {
        await worker.terminate();
        console.log('- Worker terminated successfully');
      } else {
        console.log('- No terminate method found on worker');
      }
    } catch (error) {
      console.error('OCR initialization error:', error);
    }

    console.log('Final OCR Text length:', combinedText.length);
    if (combinedText.length > 0) {
      console.log('OCR Text sample:', combinedText.substring(0, 200));
    } else {
      console.log('No text was extracted from OCR');
    }

    console.log('Parsing extracted text (if any)');
    const recipeData = this.parseRecipeText(combinedText);

    if (images.length > 0) {
      recipeData.defaultImage = {
        buffer: images[0].buffer.toString('base64'),
        mimetype: images[0].mimetype,
      };
    }

    recipeData.originalText = combinedText;

    return recipeData;
  }

  async storeRecipe(userId, recipeData) {
    console.log(`Saving recipe for user ${userId}`);

    try {
      const recipeToSave = {
        user_id: userId,
        title: recipeData.title || 'Untitled Recipe',
        ingredients: recipeData.ingredients,
        instructions: recipeData.instructions,
        prep_time: recipeData.prepTime,
        cook_time: recipeData.cookTime,
        total_time: recipeData.totalTime,
        source: recipeData.originalAuthor || 'Unknown',
        image_url: recipeData.defaultImage ? null : null,
        original_text: recipeData.originalText || '',
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

  parseRecipeText(text) {
    console.log('Parsing extracted recipe text');

    const recipeData = {
      title: '',
      ingredients: [],
      instructions: [],
      prepTime: '',
      cookTime: '',
      totalTime: '',
      originalAuthor: '',
    };

    if (!text || text.trim().length === 0) {
      console.log('No text to parse, returning empty recipe');
      return recipeData;
    }

    const cleanedText = this.preProcessText(text);
    const lines = cleanedText.split('\n').filter((line) => line.trim());

    if (lines.length === 0) {
      console.log('No lines found after splitting text');
      return recipeData;
    }

    console.log(`Found ${lines.length} lines of text to parse`);

    if (lines.length > 0) {
      const potentialTitles = lines.filter((line) => {
        return (
          line === line.toUpperCase() &&
          line.length > 3 &&
          line.length < 50 &&
          !line.match(/^[0-9]+/)
        );
      });

      if (potentialTitles.length > 0) {
        recipeData.title = potentialTitles[0].trim();
      } else {
        recipeData.title = lines[0].trim();
      }
    }

    let currentSection = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const lowerLine = line.toLowerCase();

      if (lowerLine.includes('ingredient') || lowerLine.includes('you need')) {
        currentSection = 'ingredients';
        continue;
      } else if (
        lowerLine.includes('instruction') ||
        lowerLine.includes('direction') ||
        lowerLine.includes('method') ||
        lowerLine.includes('preparation')
      ) {
        currentSection = 'instructions';
        continue;
      }

      if (lowerLine.includes('prep time') || lowerLine.includes('preparation time')) {
        const match = line.match(/(\d+\s*(?:min|hour|minute|hr|sec|second)s?)/i);
        if (match) recipeData.prepTime = match[1];
        continue;
      }

      if (lowerLine.includes('cook time') || lowerLine.includes('bake time')) {
        const match = line.match(/(\d+\s*(?:min|hour|minute|hr|sec|second)s?)/i);
        if (match) recipeData.cookTime = match[1];
        continue;
      }

      if (lowerLine.includes('total time')) {
        const match = line.match(/(\d+\s*(?:min|hour|minute|hr|sec|second)s?)/i);
        if (match) recipeData.totalTime = match[1];
        continue;
      }

      if ((line.includes('—') || line.includes('-')) && line.length < 50) {
        recipeData.originalAuthor = line;
        continue;
      }

      if (
        currentSection === 'ingredients' ||
        (!currentSection && this.isLikelyIngredientLine(line))
      ) {
        recipeData.ingredients.push(this.cleanIngredientLine(line));
        if (!currentSection) currentSection = 'ingredients';
      } else if (
        currentSection === 'instructions' ||
        (!currentSection && this.isLikelyInstructionLine(line))
      ) {
        recipeData.instructions.push(this.cleanInstructionLine(line));
        if (!currentSection) currentSection = 'instructions';
      } else if (currentSection === 'ingredients' && line.length > 40) {
        recipeData.instructions.push(this.cleanInstructionLine(line));
        currentSection = 'instructions';
      } else {
        if (line.match(/\d+\s*(cup|tbsp|tsp|oz|g|ml)/i)) {
          recipeData.ingredients.push(this.cleanIngredientLine(line));
        } else if (line.length > 40) {
          recipeData.instructions.push(this.cleanInstructionLine(line));
        }
      }
    }

    console.log('Parsing results:');
    console.log(`- Title: ${recipeData.title}`);
    console.log(`- Ingredients: ${recipeData.ingredients.length}`);
    console.log(`- Instructions: ${recipeData.instructions.length}`);
    console.log(`- Author: ${recipeData.originalAuthor}`);

    return recipeData;
  }

  preProcessText(text) {
    return text
      .replace(/(\d+)l(\d+)/g, '$1/$2')
      .replace(/(\d+)I(\d+)/g, '$1/2')
      .replace(/(\d+)\/(\s)/g, '$1/2$2')

      .replace(/(\s|^)j(\s|$)/g, '$11$2')
      .replace(/(\s|^)l(\s|$)/g, '$11$2')
      .replace(/(\s|^)z(\s|$)/g, '$12$2')
      .replace(/(\s|^)O(\s|$)/g, '$10$2')

      .replace(/(\d+)([A-Za-z])(\.)/, '$1 $2$3')
      .replace(/([Tt])(\.)(\s*)([a-z])/, '$1$2 $4');
  }

  isLikelyIngredientLine(line) {
    return /^[-•*]|\d+\s*(?:cup|c\.|tbsp|tbs|tsp|oz|g|kg|ml|l|pound|lb)|^\d+\s*(?:[¼½¾⅓⅔]|\/)|^\d+$/.test(
      line
    );
  }

  cleanIngredientLine(line) {
    return line
      .replace(/([0-9])l([0-9])/g, '$1/$2')
      .replace(/([^\d])l([^\d])/g, '$1/$2')
      .replace(/(\d+)([cC])\./, '$1 $2.')
      .replace(/(\d+)([tT])\./, '$1 $2.')
      .trim();
  }

  isLikelyInstructionLine(line) {
    return (
      /^\d+\.|\d+\)|\d+\s*[:-]|^Step|^[-•*]|^[A-Z][a-z]+\s+(and|the|to|in|on)\s/.test(line) ||
      line.length > 40
    );
  }

  cleanInstructionLine(line) {
    return line
      .replace(/([.,:;]) ([a-z])/g, '$1 $2')
      .replace(/0il/g, 'oil')
      .trim();
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
