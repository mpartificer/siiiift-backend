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

function logMemoryUsage(label) {
  const usage = process.memoryUsage();
  console.log(`=== MEMORY [${label}] ===`);
  console.log(`RSS: ${(usage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Used: ${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Total: ${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`External: ${(usage.external / 1024 / 1024).toFixed(2)} MB`);
  console.log(`========================`);
}

class RecipeService {
  async extractTextFromImages(imageFiles) {
    logMemoryUsage('START - extractTextFromImages');
    console.log(`Processing ${imageFiles.length} recipe images with AI extraction`);

    const totalInitialSize = imageFiles.reduce((sum, file) => sum + file.buffer.length, 0);
    console.log(`Total input image size: ${(totalInitialSize / 1024 / 1024).toFixed(2)} MB`);

    const processedImagePromises = imageFiles.map(async (file, index) => {
      console.log(`\n=== PROCESSING IMAGE ${index + 1}/${imageFiles.length} ===`);
      console.log(`Processing image ${index + 1}: ${file.originalname}`);
      console.log(
        `Image details: mimetype=${file.mimetype}, buffer length=${(file.buffer.length / 1024 / 1024).toFixed(2)} MB`
      );

      logMemoryUsage(`Before processing image ${index + 1}`);

      try {
        console.log(`Creating multiple preprocessed versions...`);
        logMemoryUsage(`Before creating processed versions - image ${index + 1}`);

        const [originalBuffer, gentleEnhancedBuffer, enhancedBuffer, highContrastBuffer] =
          await Promise.all([
            Promise.resolve(file.buffer),
            this.gentlePreprocessImage(file.buffer, file.mimetype),
            this.preprocessImage(file.buffer, file.mimetype),
            this.createHighContrastVersion(file.buffer),
          ]);

        logMemoryUsage(`After creating all processed versions - image ${index + 1}`);

        console.log(`Created 4 processed versions for image ${index + 1}`);
        console.log(
          `Buffer sizes - Original: ${(originalBuffer.length / 1024 / 1024).toFixed(2)} MB, Gentle: ${(gentleEnhancedBuffer.length / 1024 / 1024).toFixed(2)} MB, Enhanced: ${(enhancedBuffer.length / 1024 / 1024).toFixed(2)} MB, HighContrast: ${(highContrastBuffer.length / 1024 / 1024).toFixed(2)} MB`
        );

        const totalProcessedSize =
          originalBuffer.length +
          gentleEnhancedBuffer.length +
          enhancedBuffer.length +
          highContrastBuffer.length;
        console.log(
          `Total processed buffer size for image ${index + 1}: ${(totalProcessedSize / 1024 / 1024).toFixed(2)} MB`
        );

        console.log(`Selecting best version using improved OCR confidence testing...`);
        logMemoryUsage(`Before OCR testing - image ${index + 1}`);

        const bestBuffer = await this.selectBestImageVersion(
          {
            original: originalBuffer,
            gentle: gentleEnhancedBuffer,
            enhanced: enhancedBuffer,
            highContrast: highContrastBuffer,
          },
          file.originalname
        );

        logMemoryUsage(`After OCR testing - image ${index + 1}`);
        console.log(
          `Best buffer selected, size: ${(bestBuffer.length / 1024 / 1024).toFixed(2)} MB`
        );

        console.log(`Cleaning up unused buffers for image ${index + 1}`);
        console.log(`Converting to base64 using imageService...`);
        logMemoryUsage(`Before base64 conversion - image ${index + 1}`);

        const processedFile = {
          buffer: bestBuffer,
          mimetype: file.mimetype || 'image/jpeg',
        };

        const base64Data = await imageService.jpegToBlob(processedFile);
        logMemoryUsage(`After base64 conversion - image ${index + 1}`);
        console.log(
          `Base64 conversion complete, length: ${(base64Data.length / 1024 / 1024).toFixed(2)} MB`
        );

        const result = {
          inlineData: {
            mimeType: file.mimetype || 'image/jpeg',
            data: base64Data,
          },
        };

        logMemoryUsage(`Completed processing image ${index + 1}`);
        return result;
      } catch (error) {
        console.error(`Error processing image ${index + 1}:`, error);
        logMemoryUsage(`Error occurred processing image ${index + 1}`);
        console.log(`Falling back to original image...`);
        const base64Data = file.buffer.toString('base64');
        return {
          inlineData: {
            mimeType: file.mimetype || 'image/jpeg',
            data: base64Data,
          },
        };
      }
    });

    console.log(`\n=== AWAITING ALL IMAGE PROCESSING ===`);
    logMemoryUsage('Before Promise.all - all images');

    const imageParts = await Promise.all(processedImagePromises);

    logMemoryUsage('After Promise.all - all images processed');
    console.log(`All images processed successfully, sending to AI...`);

    const totalAIPayloadSize = imageParts.reduce((sum, part) => {
      return sum + (part.inlineData.data.length || 0);
    }, 0);
    console.log(`Total AI payload size: ${(totalAIPayloadSize / 1024 / 1024).toFixed(2)} MB`);

    const prompt =
      'Extract the following information from this image and return the information in a json: "prep_time", "cook_time", "total_time", "title", "ingredients", and "instructions". Prep time, cook time, total time, and title should all be string values. Ingredients and instructions should be arrays populated with strings. Do not add any additional formatting around the json object, as the results must be formatted for my front end. It should start with { and end with }';

    const partsForGemini = [{ text: prompt }, ...imageParts];

    console.log(`Calling Gemini AI with ${imageParts.length} processed images...`);
    logMemoryUsage('Before Gemini AI call');

    const result = await model.generateContent({
      contents: [
        {
          parts: partsForGemini,
        },
      ],
    });

    logMemoryUsage('After Gemini AI call');
    const response = result.response;
    console.log(`AI processing complete!`);

    logMemoryUsage('END - extractTextFromImages');
    return response.text();
  }

  async gentlePreprocessImage(imageBuffer, mimeType) {
    console.log('  → Starting gentle image enhancement');
    console.log(
      `    Input: buffer length=${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB, mimeType=${mimeType}`
    );
    logMemoryUsage('Before gentle preprocessing');

    try {
      let sharpImage = sharp(imageBuffer);

      const metadata = await sharpImage.metadata();
      console.log(
        `    Image metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`
      );
      logMemoryUsage('After metadata extraction');

      if (!['jpeg', 'png', 'webp', 'tiff'].includes(metadata.format)) {
        console.log(`    Converting from ${metadata.format} to png`);
        sharpImage = sharpImage.toFormat('png');
      }

      console.log(`    Applying gentle enhancement...`);
      sharpImage = sharpImage.normalize().modulate({
        brightness: 1.02,
        contrast: 1.1,
      });

      if (metadata.width && metadata.width > 1200) {
        console.log('    Resizing large image while preserving detail');
        sharpImage = sharpImage.resize({
          width: Math.min(metadata.width, 1600),
          height: Math.min(metadata.height, 2000),
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      console.log(`    Generating gentle processed buffer...`);
      logMemoryUsage('Before gentle buffer generation');

      const processedBuffer = await sharpImage.toBuffer();

      logMemoryUsage('After gentle buffer generation');
      console.log(
        `    Gentle preprocessing complete: Original=${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB -> Processed=${(processedBuffer.length / 1024 / 1024).toFixed(2)} MB`
      );

      return processedBuffer;
    } catch (error) {
      console.error('    Gentle preprocessing error:', error);
      logMemoryUsage('Error during gentle preprocessing');
      console.log('    Using original image due to gentle preprocessing error');
      return imageBuffer;
    }
  }

  async preprocessImage(imageBuffer, mimeType) {
    console.log('  → Starting image preprocessing');
    console.log(
      `    Input: buffer length=${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB, mimeType=${mimeType}`
    );
    logMemoryUsage('Before preprocessing');

    try {
      let sharpImage = sharp(imageBuffer);

      const metadata = await sharpImage.metadata();
      console.log(
        `    Image metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`
      );
      logMemoryUsage('After metadata extraction');

      if (!['jpeg', 'png', 'webp', 'tiff'].includes(metadata.format)) {
        console.log(`    Converting from ${metadata.format} to png for better processing`);
        sharpImage = sharpImage.toFormat('png');
      }

      console.log(`    Applying preprocessing pipeline...`);
      sharpImage = sharpImage
        .grayscale()
        .normalize()
        .modulate({
          brightness: 1.05,
          saturation: 0,
          contrast: 1.4,
        })
        .sharpen({
          sigma: 1.5,
          flat: 1.0,
          jagged: 1.0,
        })
        .threshold(140)
        .median(1);

      if (metadata.width && metadata.width > 800) {
        console.log('    Large image detected, applying resize for better processing');
        sharpImage = sharpImage.resize({
          width: Math.min(metadata.width, 2000),
          height: Math.min(metadata.height, 2800),
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      console.log(`    Generating final buffer...`);
      logMemoryUsage('Before enhanced buffer generation');

      const processedBuffer = await sharpImage.toBuffer();

      logMemoryUsage('After enhanced buffer generation');
      console.log(
        `    Image preprocessing complete: Original=${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB -> Processed=${(processedBuffer.length / 1024 / 1024).toFixed(2)} MB`
      );

      return processedBuffer;
    } catch (error) {
      console.error('    Error during image preprocessing:', error);
      logMemoryUsage('Error during preprocessing');
      console.log('    Using original image due to preprocessing error');
      return imageBuffer;
    }
  }

  async createHighContrastVersion(imageBuffer) {
    console.log('  → Creating high contrast version');
    console.log(`    Input buffer size: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    logMemoryUsage('Before high contrast processing');

    try {
      const processedBuffer = await sharp(imageBuffer)
        .grayscale()
        .normalize()
        .modulate({
          brightness: 1.1,
          contrast: 2.0,
        })
        .sharpen()
        .threshold(120)
        .toBuffer();

      logMemoryUsage('After high contrast processing');
      console.log(
        `    High contrast version created: ${(processedBuffer.length / 1024 / 1024).toFixed(2)} MB`
      );
      return processedBuffer;
    } catch (error) {
      console.error('    Error creating high contrast version:', error);
      logMemoryUsage('Error during high contrast processing');
      return imageBuffer;
    }
  }

  async selectBestImageVersion(imageVersions, imageName) {
    console.log(
      `\n  → Selecting best version for ${imageName} using improved OCR confidence testing`
    );
    logMemoryUsage('Before OCR worker initialization');

    const totalVersionsSize = Object.values(imageVersions).reduce(
      (sum, buffer) => sum + buffer.length,
      0
    );
    console.log(
      `    Total memory for all versions: ${(totalVersionsSize / 1024 / 1024).toFixed(2)} MB`
    );

    let worker;
    try {
      console.log(`    Initializing Tesseract worker...`);
      worker = await createWorker('eng');
      logMemoryUsage('After OCR worker initialization');

      console.log(`    Setting OCR parameters for better text detection...`);
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
      });
      console.log(`    OCR worker initialized successfully`);

      let bestResult = {
        buffer: imageVersions.gentle || imageVersions.original,
        confidence: 0,
        version: 'gentle',
        textLength: 0,
      };

      for (const [versionName, buffer] of Object.entries(imageVersions)) {
        try {
          console.log(
            `    Testing ${versionName} version (buffer size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB)...`
          );
          logMemoryUsage(`Before OCR recognition - ${versionName}`);

          const result = await worker.recognize(buffer);

          logMemoryUsage(`After OCR recognition - ${versionName}`);
          console.log(`    OCR result for ${versionName}:`, {
            hasText: !!result.text,
            textLength: result.text ? result.text.length : 0,
            textSample: result.text ? result.text.substring(0, 50) + '...' : 'No text',
            hasData: !!result.data,
            hasLines: !!(result.data && result.data.lines),
            hasBlocks: !!(result.data && result.data.blocks),
            hasWords: !!(result.data && result.data.words),
          });

          const confidence = this.calculateImprovedConfidence(result);
          console.log(
            `    ${versionName} confidence: ${confidence.toFixed(2)}% (text length: ${result.text ? result.text.length : 0})`
          );

          const score = confidence + (result.text ? result.text.length * 0.1 : 0);
          const currentBestScore = bestResult.confidence + bestResult.textLength * 0.1;

          if (score > currentBestScore) {
            bestResult = {
              buffer: buffer,
              confidence: confidence,
              version: versionName,
              textLength: result.text ? result.text.length : 0,
            };
            console.log(`    New best version: ${versionName} (score: ${score.toFixed(2)})`);
          }
        } catch (error) {
          console.error(`    Error testing ${versionName} version:`, error);
          logMemoryUsage(`Error during ${versionName} OCR`);
        }
      }

      console.log(
        `    Final selection: ${bestResult.version} with confidence: ${bestResult.confidence.toFixed(2)}% and ${bestResult.textLength} characters`
      );

      if (worker && typeof worker.terminate === 'function') {
        await worker.terminate();
        logMemoryUsage('After OCR worker termination');
        console.log(`    OCR worker terminated`);
      }

      return bestResult.buffer;
    } catch (error) {
      console.error('    Error in OCR confidence testing:', error);
      logMemoryUsage('Error during OCR processing');
      console.log('    Falling back to gentle enhanced version');

      if (worker && typeof worker.terminate === 'function') {
        try {
          await worker.terminate();
        } catch (terminateError) {
          console.error('    Error terminating worker:', terminateError);
        }
      }

      return imageVersions.gentle || imageVersions.enhanced || imageVersions.original;
    }
  }

  calculateImprovedConfidence(result) {
    console.log(`    Calculating improved confidence...`);

    if (!result) {
      console.log(`    No result provided`);
      return 0;
    }

    console.log(`    Result structure:`, {
      hasText: !!result.text,
      textLength: result.text ? result.text.length : 0,
      hasData: !!result.data,
      dataKeys: result.data ? Object.keys(result.data) : 'No data',
    });

    if (!result.data) {
      console.log(`    No data in result`);
      return 0;
    }

    let confidence = 0;
    let method = 'none';

    if (result.data.lines && result.data.lines.length > 0) {
      console.log(`    Using lines method: ${result.data.lines.length} lines`);
      const totalConfidence = result.data.lines.reduce(
        (sum, line) => sum + (line.confidence || 0),
        0
      );
      confidence = totalConfidence / result.data.lines.length;
      method = 'lines';
    } else if (result.data.words && result.data.words.length > 0) {
      console.log(`    Using words method: ${result.data.words.length} words`);
      const totalConfidence = result.data.words.reduce(
        (sum, word) => sum + (word.confidence || 0),
        0
      );
      confidence = totalConfidence / result.data.words.length;
      method = 'words';
    } else if (result.data.blocks && result.data.blocks.length > 0) {
      console.log(`    Using blocks method: ${result.data.blocks.length} blocks`);
      const totalConfidence = result.data.blocks.reduce(
        (sum, block) => sum + (block.confidence || 0),
        0
      );
      confidence = totalConfidence / result.data.blocks.length;
      method = 'blocks';
    } else if (result.data.confidence !== undefined) {
      console.log(`    Using overall confidence`);
      confidence = result.data.confidence;
      method = 'overall';
    } else if (result.text && result.text.length > 0) {
      console.log(`    Text found but no confidence data, using text-based score`);
      confidence = Math.min(50, result.text.length * 0.5);
      method = 'text-length';
    }

    console.log(
      `    Confidence calculation: method=${method}, confidence=${confidence.toFixed(2)}, textLength=${result.text ? result.text.length : 0}`
    );

    return confidence;
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
