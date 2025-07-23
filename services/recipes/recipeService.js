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

geminiRecipeLimiter.on('received', (info) => {});

geminiRecipeLimiter.on('done', (info) => {});

function forceGC() {
  if (global.gc) {
    global.gc();
  }
}

class RecipeService {
  async extractRecipeFromUrl(url) {
    try {
      const htmlContent = await this.scrapeWebpage(url);

      const imageUrl = await this.extractRecipeImage(url);

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

        if (imageUrl) {
          parsedResult.images = [imageUrl];
        }

        const finalResult = JSON.stringify(parsedResult);

        return finalResult;
      } catch (parseError) {
        console.error(`Error parsing AI result for URL ${url}:`, parseError);
        throw new Error(`Failed to parse AI response: ${parseError.message}`);
      }
    } catch (error) {
      console.error(`Error extracting recipe from URL: ${url}`, error);
      throw new Error(`Failed to extract recipe from URL: ${error.message}`);
    }
  }

  async extractRecipeImage(url) {
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
        return null;
      }

      const $ = cheerio.load(response.data);

      const structuredImage = this.extractImageFromStructuredData($);
      if (structuredImage) {
        const absoluteImageUrl = this.makeAbsoluteUrl(structuredImage, url);
        return absoluteImageUrl;
      }

      const recipeImageUrl = this.extractImageFromSelectors($, url);
      if (recipeImageUrl) {
        return recipeImageUrl;
      }

      return null;
    } catch (error) {
      console.error('Error extracting recipe image:', error);
      return null;
    }
  }

  extractImageFromStructuredData($) {
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

            if (recipe && recipe.image) {
              let imageUrl = recipe.image;

              if (Array.isArray(imageUrl)) {
                imageUrl = imageUrl[0];
              }

              if (typeof imageUrl === 'object' && imageUrl.url) {
                imageUrl = imageUrl.url;
              }

              if (typeof imageUrl === 'string') {
                return imageUrl;
              }
            }
          }
        }
      } catch (e) {}
    }

    return null;
  }

  extractImageFromSelectors($, baseUrl) {
    const selectors = [
      '[itemprop="image"]',

      '.recipe-image img',
      '.recipe-photo img',
      '.recipe-hero img',
      '.recipe-card img',
      '.wp-block-image img',
      '.entry-content img:first-of-type',

      'meta[property="og:image"]',
      'meta[name="twitter:image"]',

      '.featured-image img',
      '.post-thumbnail img',
      '.hero-image img',
      'article img:first-of-type',

      'img[alt*="recipe" i]',
      'img[src*="recipe" i]',
      'main img:first-of-type',
    ];

    for (const selector of selectors) {
      const element = $(selector).first();

      if (element.length > 0) {
        let imageUrl;

        if (element.is('meta')) {
          imageUrl = element.attr('content');
        } else {
          imageUrl =
            element.attr('src') || element.attr('data-src') || element.attr('data-lazy-src');
        }

        if (imageUrl) {
          const absoluteUrl = this.makeAbsoluteUrl(imageUrl, baseUrl);

          if (this.isValidImageUrl(absoluteUrl)) {
            return absoluteUrl;
          }
        }
      }
    }

    return null;
  }

  makeAbsoluteUrl(imageUrl, baseUrl) {
    try {
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
      }

      const base = new URL(baseUrl);

      if (imageUrl.startsWith('//')) {
        return base.protocol + imageUrl;
      }

      if (imageUrl.startsWith('/')) {
        return base.origin + imageUrl;
      }

      return new URL(imageUrl, baseUrl).href;
    } catch (error) {
      console.error('Error making absolute URL:', error);
      return imageUrl;
    }
  }

  isValidImageUrl(url) {
    try {
      const urlObj = new URL(url);

      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
      const pathname = urlObj.pathname.toLowerCase();

      const hasImageExtension = imageExtensions.some((ext) => pathname.includes(ext));

      const hasImageKeywords =
        pathname.includes('image') || pathname.includes('photo') || pathname.includes('recipe');

      return hasImageExtension || hasImageKeywords;
    } catch (error) {
      return false;
    }
  }

  async checkUrlExists(url) {
    try {
      const existingRecipe = await recipeRepository.findRecipeByUrl(url);
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

    const formatImages = (images) => {
      if (!images) return [];
      if (Array.isArray(images)) {
        return images.map((img) => {
          if (typeof img === 'string') return this.makeAbsoluteUrl(img, url);
          if (img.url) return this.makeAbsoluteUrl(img.url, url);
          return img.toString();
        });
      }
      if (typeof images === 'string') {
        return [this.makeAbsoluteUrl(images, url)];
      }
      if (images.url) {
        return [this.makeAbsoluteUrl(images.url, url)];
      }
      return [];
    };

    const structuredData = {
      title: recipe.name || '',
      ingredients: formatIngredients(recipe.recipeIngredient),
      instructions: formatInstructions(recipe.recipeInstructions),
      prep_time: formatTime(recipe.prepTime),
      cook_time: formatTime(recipe.cookTime),
      total_time: formatTime(recipe.totalTime),
      original_author: url,
      images: formatImages(recipe.image),
    };

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
              return this.formatStructuredRecipeData(recipe, url);
            }
          }
        }
      } catch (e) {}
    }

    return null;
  }

  async scrapeWebpage(url) {
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
        return structuredData;
      }

      const extractedContent = this.extractRelevantContent($, url);

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
    if (htmlContent.startsWith('{') && htmlContent.endsWith('}')) {
      try {
        JSON.parse(htmlContent);
        return htmlContent;
      } catch (e) {}
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
      try {
        const result = await model.generateContent({
          contents: [{ parts: [{ text: prompt }] }],
        });

        return result.response.text();
      } catch (error) {
        console.error(`Error in Gemini AI call for URL:`, error);

        if (error.message?.includes('rate limit') || error.status === 429) {
          throw new Error('Google API rate limit exceeded - request will be retried');
        }

        throw error;
      }
    });

    try {
      const aiResult = await rateLimitedAICall();

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
              return this.formatStructuredRecipeData(recipe);
            }
          }
        }
      } catch (e) {}
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
    if (htmlContent.startsWith('{') && htmlContent.endsWith('}')) {
      try {
        JSON.parse(htmlContent);
        return htmlContent;
      } catch (e) {}
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
      try {
        const result = await model.generateContent({
          contents: [{ parts: [{ text: prompt }] }],
        });

        return result.response.text();
      } catch (error) {
        console.error(`Error in Gemini AI call for URL:`, error);

        if (error.message?.includes('rate limit') || error.status === 429) {
          throw new Error('Google API rate limit exceeded - request will be retried');
        }

        throw error;
      }
    });

    try {
      const aiResult = await rateLimitedAICall();

      return aiResult;
    } catch (error) {
      console.error(`Rate-limited AI call failed for URL:`, error);
      throw new Error(`Failed to extract recipe from URL: ${error.message}`);
    }
  }

  async extractTextFromImages(imageFiles) {
    const totalInitialSize = imageFiles.reduce((sum, file) => sum + file.buffer.length, 0);

    const imageParts = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];

      try {
        const processedImagePart = await this.processSingleImageOptimized(file, i + 1);
        imageParts.push(processedImagePart);

        forceGC();
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

    const prompt =
      'Extract the following information from this image and return the information in a json: "prep_time", "cook_time", "total_time", "title", "ingredients", and "instructions". Prep time, cook time, total time, and title should all be string values. Ingredients and instructions should be arrays populated with strings. Do not add any additional formatting around the json object, as the results must be formatted for my front end. It should start with { and end with }';

    const partsForGemini = [{ text: prompt }, ...imageParts];

    const rateLimitedAICall = geminiRecipeLimiter.wrap(async () => {
      try {
        const result = await model.generateContent({
          contents: [{ parts: partsForGemini }],
        });

        return result.response.text();
      } catch (error) {
        console.error(`Error in Gemini AI call:`, error);

        if (error.message?.includes('rate limit') || error.status === 429) {
          throw new Error('Google API rate limit exceeded - request will be retried');
        }

        throw error;
      }
    });

    try {
      const aiResult = await rateLimitedAICall();

      return aiResult;
    } catch (error) {
      console.error(`Rate-limited AI call failed:`, error);
      throw new Error(`Failed to extract recipe from images: ${error.message}`);
    }
  }

  async processSingleImageOptimized(file, imageIndex) {
    try {
      const optimizedBuffer = await this.createOptimizedVersion(file.buffer, file.mimetype);

      const processedFile = {
        buffer: optimizedBuffer,
        mimetype: file.mimetype || 'image/jpeg',
      };

      const base64Data = await imageService.jpegToBlob(processedFile);

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

      return processedBuffer;
    } catch (error) {
      console.error('    Error in optimization:', error);

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

        return fallbackBuffer;
      } catch (fallbackError) {
        return imageBuffer;
      }
    }
  }

  async storeRecipe(userId, recipeData) {
    try {
      const recipeToSave = {
        title: recipeData.title || 'Untitled Recipe',
        ingredients: recipeData.ingredients,
        instructions: recipeData.instructions,
        prep_time: recipeData.prep_time,
        cook_time: recipeData.cook_time,
        total_time: recipeData.total_time,
        original_link: recipeData.original_link || 'Unknown',
        images: recipeData.images || [],
      };

      const savedRecipe = await recipeRepository.createRecipe(recipeToSave);

      if (recipeData.defaultImage && recipeData.defaultImage.buffer) {
        await recipeRepository.saveRecipeImage(
          savedRecipe.id,
          recipeData.defaultImage.buffer,
          recipeData.defaultImage.mimetype
        );
      }

      return savedRecipe;
    } catch (error) {
      console.error('Error saving recipe:', error);
      throw error;
    }
  }

  async getRecipeDetails(recipeId) {
    try {
      const recipeDetails = await recipeRepository.getRecipeById(recipeId);
      return recipeDetails;
    } catch (error) {
      console.error(`Error getting recipe details:`, error);
      throw error;
    }
  }

  async updateRecipeImage(recipeId, imageUrl) {
    try {
      const updatedRecipe = await recipeRepository.updateRecipeImage(recipeId, imageUrl);
      return updatedRecipe;
    } catch (error) {
      console.error('=== SERVICE ERROR ===');
      console.error('Error in updateRecipeImage service:', error);
      throw error;
    }
  }

  async getRecipeRatings(recipeId) {
    try {
      const ratings = await recipeRepository.getRecipeRatings(recipeId);
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
      const savedRecipes = await recipeRepository.getSavesByUserId(userId);
      return savedRecipes;
    } catch (error) {
      console.error(`Error getting recipe saves:`, error);
      throw error;
    }
  }

  async getRecipeDropdownData(userId) {
    try {
      const savedRecipes = await recipeRepository.getSavesByUserId(userId);

      const formattedRecipes = savedRecipes.map((recipe) => ({
        recipe_id: recipe.recipe_id,
        recipe_title: recipe.recipe_title,
      }));

      return formattedRecipes;
    } catch (error) {
      console.error(`Error getting recipe dropdown data:`, error);
      throw error;
    }
  }

  async getRecipeStats(recipeId) {
    try {
      const [likesResponse, savesResponse, bakesResponse] = await Promise.all([
        recipeRepository.getLikesByRecipeId(recipeId),
        recipeRepository.getSavesByRecipeId(recipeId),
        recipeRepository.getBakesByRecipeId(recipeId),
      ]);

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
      const bakes = await recipeRepository.getBakeDetailsView(recipeId);
      return bakes;
    } catch (error) {
      console.error(`Error getting bakes list:`, error);
      throw error;
    }
  }

  async toggleSave(userId, recipeId) {
    try {
      const isSaved = await recipeRepository.checkUserSave(userId, recipeId);

      if (isSaved) {
        await recipeRepository.removeSave(userId, recipeId);

        const { count: saveCount } = await recipeRepository.getSavesByRecipeId(recipeId);

        return {
          isSaved: false,
          saveCount,
        };
      } else {
        await recipeRepository.addSave(userId, recipeId);

        const { count: saveCount } = await recipeRepository.getSavesByRecipeId(recipeId);

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
      const isSaved = await recipeRepository.checkUserSave(userId, recipeId);
      return isSaved;
    } catch (error) {
      console.error(`Error checking user save:`, error);
      throw error;
    }
  }

  async searchRecipes(searchTerm) {
    try {
      const recipes = await recipeRepository.searchRecipes(searchTerm);

      const formattedRecipes = recipes.map((recipe) => ({
        id: recipe.id,
        recipeId: recipe.id,
        title: recipe.title,
        images: recipe.images,
        type: 'recipe',
      }));

      return formattedRecipes;
    } catch (error) {
      console.error(`Error searching recipes:`, error);
      throw new Error(`Failed to search recipes: ${error.message}`);
    }
  }
}

module.exports = new RecipeService();
