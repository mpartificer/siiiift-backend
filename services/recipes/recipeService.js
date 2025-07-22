const recipeRepository = require('../../repository/recipes/recipeRepository');
const userRepository = require('../../repository/users/userRepository');
const imageService = require('../images/imageService');
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Bottleneck = require('bottleneck');
require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');

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
    console.log('Forced garbage collection');
  }
}

class RecipeService {
  async extractRecipeFromUrl(url) {
    console.log(`Starting URL recipe extraction for: ${url}`);

    try {
      const htmlContent = await this.scrapeWebpage(url);

      const aiResult = await this.processHtmlWithAI(htmlContent, url);

      let parsedResult;
      try {
        let cleanedResult = aiResult;
        if (cleanedResult.startsWith('```json')) {
          cleanedResult = cleanedResult.substring(7);
        } else if (cleanedResult.startsWith('```')) {
          cleanedResult = cleanedResult.substring(3);
        }
        if (cleanedResult.endsWith('```')) {
          cleanedResult = cleanedResult.substring(0, cleanedResult.length - 3);
        }
        cleanedResult = cleanedResult.trim();

        parsedResult = JSON.parse(cleanedResult);

        parsedResult.original_author = url;

        console.log(`Forced original_author to URL: ${url}`);

        const finalResult = JSON.stringify(parsedResult);
        console.log(`URL recipe extraction completed for: ${url}`);

        return finalResult;
      } catch (parseError) {
        console.error(`Error parsing AI result for URL ${url}:`, parseError);
        console.log(`AI result was:`, aiResult);
        throw new Error(`Failed to parse AI response: ${parseError.message}`);
      }
    } catch (error) {
      console.error(`Error extracting recipe from URL: ${url}`, error);
      throw new Error(`Failed to extract recipe from URL: ${error.message}`);
    }
  }

  async checkUrlExists(url) {
    try {
      console.log(`Checking if URL already exists: ${url}`);
      const existingRecipe = await recipeRepository.findRecipeByUrl(url);
      console.log(`URL check result:`, existingRecipe);
      return existingRecipe;
    } catch (error) {
      console.error(`Error checking URL existence:`, error);
      throw error;
    }
  }

  formatStructuredRecipeData(recipe, url) {
    const formatTime = (time) => {
      if (!time) return '';
      if (typeof time === 'string' && time.startsWith('PT')) {
        const match = time.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (match) {
          const hours = match[1] ? parseInt(match[1]) : 0;
          const minutes = match[2] ? parseInt(match[2]) : 0;
          if (hours && minutes) return `${hours}h ${minutes}m`;
          if (hours) return `${hours}h`;
          if (minutes) return `${minutes}m`;
        }
      }
      return time.toString();
    };

    const formatInstructions = (instructions) => {
      if (!instructions) return [];
      if (Array.isArray(instructions)) {
        return instructions.map((inst) => {
          if (typeof inst === 'string') return inst;
          if (inst.text) return inst.text;
          return inst.toString();
        });
      }
      return [instructions.toString()];
    };

    const formatIngredients = (ingredients) => {
      if (!ingredients) return [];
      if (Array.isArray(ingredients)) {
        return ingredients.map((ing) => {
          if (typeof ing === 'string') return ing;
          if (ing.text) return ing.text;
          return ing.toString();
        });
      }
      return [ingredients.toString()];
    };

    const structuredData = {
      title: recipe.name || '',
      ingredients: formatIngredients(recipe.recipeIngredient),
      instructions: formatInstructions(recipe.recipeInstructions),
      prep_time: formatTime(recipe.prepTime),
      cook_time: formatTime(recipe.cookTime),
      total_time: formatTime(recipe.totalTime),
      original_author: url,
    };

    console.log(`Structured data created with original_author: ${url}`);
    return JSON.stringify(structuredData);
  }

  extractStructuredData($, url) {
    const jsonLdScripts = $('script[type="application/ld+json"]');

    for (let i = 0; i < jsonLdScripts.length; i++) {
      try {
        const jsonText = $(jsonLdScripts[i]).html();
        const data = JSON.parse(jsonText);

        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (
            item['@type'] === 'Recipe' ||
            (item['@graph'] && item['@graph'].some((g) => g['@type'] === 'Recipe'))
          ) {
            const recipe =
              item['@type'] === 'Recipe'
                ? item
                : item['@graph'].find((g) => g['@type'] === 'Recipe');

            if (recipe) {
              console.log('Successfully extracted structured recipe data');
              return this.formatStructuredRecipeData(recipe, url);
            }
          }
        }
      } catch (e) {
        console.log('Could not parse JSON-LD data, continuing...');
      }
    }

    return null;
  }

  async scrapeWebpage(url) {
    console.log(`Scraping webpage: ${url}`);

    try {
      const headers = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      };

      const response = await axios.get(url, {
        headers,
        timeout: 10000,
        maxRedirects: 5,
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch webpage: HTTP ${response.status}`);
      }

      const $ = cheerio.load(response.data);

      const structuredData = this.extractStructuredData($, url);
      if (structuredData) {
        console.log('Found structured recipe data');
        return structuredData;
      }

      const extractedContent = this.extractRelevantContent($, url);
      console.log(`Extracted ${extractedContent.length} characters of content`);

      return extractedContent;
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Unable to reach the website. Please check the URL.');
      }
      if (error.code === 'ETIMEDOUT') {
        throw new Error('Request timed out. Please try again.');
      }
      throw new Error(`Failed to scrape webpage: ${error.message}`);
    }
  }

  async processHtmlWithAI(htmlContent, url) {
    console.log(`Processing webpage content with AI for URL: ${url}`);
    logMemoryUsage('Before URL AI processing');

    if (htmlContent.startsWith('{') && htmlContent.endsWith('}')) {
      try {
        JSON.parse(htmlContent);
        console.log('Content is already structured JSON, returning directly');
        return htmlContent;
      } catch (e) {
        console.log('Content looks like JSON but is invalid, processing with AI');
      }
    }

    const prompt = `Extract recipe information from this webpage content and return it as valid JSON. The JSON should contain exactly these fields: "title", "ingredients", "instructions", "prep_time", "cook_time", "total_time", and "original_author".

Requirements:
- title: string (recipe name)
- ingredients: array of strings (each ingredient as a separate string)
- instructions: array of strings (each step as a separate string) 
- prep_time: string (e.g., "15 minutes", "1 hour")
- cook_time: string (e.g., "30 minutes", "2 hours")  
- total_time: string (e.g., "45 minutes", "3 hours")
- original_author: string (should be "${url}")

Return only the JSON object, starting with { and ending with }. Do not include any additional text or formatting.

Webpage content:
${htmlContent}`;

    const rateLimitedAICall = geminiRecipeLimiter.wrap(async () => {
      console.log(`Executing rate-limited Gemini AI call for URL recipe extraction...`);

      try {
        const result = await model.generateContent({
          contents: [{ parts: [{ text: prompt }] }],
        });

        console.log(`Gemini AI call completed successfully for URL`);
        return result.response.text();
      } catch (error) {
        console.error(`Error in Gemini AI call for URL:`, error);

        if (error.message?.includes('rate limit') || error.status === 429) {
          console.log(`Google rate limit hit for URL processing, will retry automatically`);
          throw new Error('Google API rate limit exceeded - request will be retried');
        }

        throw error;
      }
    });

    try {
      const aiResult = await rateLimitedAICall();
      logMemoryUsage('After URL AI processing');
      console.log(`AI processing complete for URL: ${url}`);

      return aiResult;
    } catch (error) {
      console.error(`Rate-limited AI call failed for URL:`, error);
      throw new Error(`Failed to extract recipe from URL: ${error.message}`);
    }
  }

  extractStructuredData($) {
    const jsonLdScripts = $('script[type="application/ld+json"]');

    for (let i = 0; i < jsonLdScripts.length; i++) {
      try {
        const jsonText = $(jsonLdScripts[i]).html();
        const data = JSON.parse(jsonText);

        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (
            item['@type'] === 'Recipe' ||
            (item['@graph'] && item['@graph'].some((g) => g['@type'] === 'Recipe'))
          ) {
            const recipe =
              item['@type'] === 'Recipe'
                ? item
                : item['@graph'].find((g) => g['@type'] === 'Recipe');

            if (recipe) {
              console.log('Successfully extracted structured recipe data');
              return this.formatStructuredRecipeData(recipe);
            }
          }
        }
      } catch (e) {
        console.log('Could not parse JSON-LD data, continuing...');
      }
    }

    return null;
  }

  formatStructuredRecipeData(recipe) {
    const formatTime = (time) => {
      if (!time) return '';
      if (typeof time === 'string' && time.startsWith('PT')) {
        const match = time.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (match) {
          const hours = match[1] ? parseInt(match[1]) : 0;
          const minutes = match[2] ? parseInt(match[2]) : 0;
          if (hours && minutes) return `${hours}h ${minutes}m`;
          if (hours) return `${hours}h`;
          if (minutes) return `${minutes}m`;
        }
      }
      return time.toString();
    };

    const formatInstructions = (instructions) => {
      if (!instructions) return [];
      if (Array.isArray(instructions)) {
        return instructions.map((inst) => {
          if (typeof inst === 'string') return inst;
          if (inst.text) return inst.text;
          return inst.toString();
        });
      }
      return [instructions.toString()];
    };

    const formatIngredients = (ingredients) => {
      if (!ingredients) return [];
      if (Array.isArray(ingredients)) {
        return ingredients.map((ing) => {
          if (typeof ing === 'string') return ing;
          if (ing.text) return ing.text;
          return ing.toString();
        });
      }
      return [ingredients.toString()];
    };

    return JSON.stringify({
      title: recipe.name || '',
      ingredients: formatIngredients(recipe.recipeIngredient),
      instructions: formatInstructions(recipe.recipeInstructions),
      prep_time: formatTime(recipe.prepTime),
      cook_time: formatTime(recipe.cookTime),
      total_time: formatTime(recipe.totalTime),
      original_author: recipe.author?.name || recipe.author || '',
    });
  }

  extractRelevantContent($, url) {
    $('script, style, nav, header, footer, .ad, .advertisement, .sidebar, .comments').remove();

    const recipeSelectors = [
      '[itemtype*="Recipe"]',
      '.recipe',
      '.recipe-card',
      '.recipe-content',
      '.entry-content',
      '.post-content',
      'main',
      'article',
    ];

    let content = '';

    for (const selector of recipeSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        content = elements.first().text().trim();
        if (content.length > 200) {
          break;
        }
      }
    }

    if (!content || content.length < 200) {
      content = $('body').text().trim();
    }

    content = content.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();

    if (content.length > 15000) {
      content = content.substring(0, 15000) + '...';
    }

    return content;
  }

  async processHtmlWithAI(htmlContent, url) {
    console.log(`Processing webpage content with AI for URL: ${url}`);
    logMemoryUsage('Before URL AI processing');

    if (htmlContent.startsWith('{') && htmlContent.endsWith('}')) {
      try {
        JSON.parse(htmlContent);
        console.log('Content is already structured JSON, returning directly');
        return htmlContent;
      } catch (e) {
        console.log('Content looks like JSON but is invalid, processing with AI');
      }
    }

    const prompt = `Extract recipe information from this webpage content and return it as valid JSON. The JSON should contain exactly these fields: "title", "ingredients", "instructions", "prep_time", "cook_time", "total_time", and "original_author".
  
  Requirements:
  - title: string (recipe name)
  - ingredients: array of strings (each ingredient as a separate string)
  - instructions: array of strings (each step as a separate string) 
  - prep_time: string (e.g., "15 minutes", "1 hour")
  - cook_time: string (e.g., "30 minutes", "2 hours")  
  - total_time: string (e.g., "45 minutes", "3 hours")
  - original_author: string (author/source name)
  
  Return only the JSON object, starting with { and ending with }. Do not include any additional text or formatting.
  
  Webpage content:
  ${htmlContent}`;

    const rateLimitedAICall = geminiRecipeLimiter.wrap(async () => {
      console.log(`Executing rate-limited Gemini AI call for URL recipe extraction...`);

      try {
        const result = await model.generateContent({
          contents: [{ parts: [{ text: prompt }] }],
        });

        console.log(`Gemini AI call completed successfully for URL`);
        return result.response.text();
      } catch (error) {
        console.error(`Error in Gemini AI call for URL:`, error);

        if (error.message?.includes('rate limit') || error.status === 429) {
          console.log(`Google rate limit hit for URL processing, will retry automatically`);
          throw new Error('Google API rate limit exceeded - request will be retried');
        }

        throw error;
      }
    });

    try {
      const aiResult = await rateLimitedAICall();
      logMemoryUsage('After URL AI processing');
      console.log(`AI processing complete for URL: ${url}`);

      return aiResult;
    } catch (error) {
      console.error(`Rate-limited AI call failed for URL:`, error);
      throw new Error(`Failed to extract recipe from URL: ${error.message}`);
    }
  }

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

        console.log(`Gemini AI call completed successfully`);
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
      console.log(`Recipe AI: About to call bottleneck. Limiter exists: ${!!geminiRecipeLimiter}`);
      console.log(
        `Recipe AI: Limiter methods available: queued=${typeof geminiRecipeLimiter.queued}, wrap=${typeof geminiRecipeLimiter.wrap}`
      );
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
