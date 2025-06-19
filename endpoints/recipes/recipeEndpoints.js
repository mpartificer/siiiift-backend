const express = require('express');
const router = express.Router();
const recipeService = require('../../services/recipes/recipeService');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/analyze', upload.array('images', 10), async (req, res) => {
  try {
    const { userId } = req.body;
    console.log(`API request: Analyze recipe images for user ${userId}`);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    if (req.user.id !== userId) {
      return res.status(403).json({
        error: 'Unauthorized action',
        authenticatedUserId: req.user.id,
        requestedUserId: userId,
      });
    }

    const images = req.files.map((file) => ({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    }));

    const recipeData = await recipeService.extractTextFromImages(images);

    console.log(`Returning analyzed recipe data for user ${userId}`);
    res.json(recipeData);
  } catch (error) {
    console.error('Error analyzing recipe images:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/store-recipe', async (req, res) => {
  try {
    const { userId, recipeData } = req.body;
    console.log(`API request: Store processed recipe for user ${userId}`);

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!recipeData) {
      return res.status(400).json({ error: 'recipeData is required' });
    }

    if (req.user.id !== userId) {
      return res.status(403).json({
        error: 'Unauthorized action',
        authenticatedUserId: req.user.id,
        requestedUserId: userId,
      });
    }

    const savedRecipe = await recipeService.storeRecipe(userId, recipeData);

    console.log(`Recipe saved successfully for user ${userId}`);
    res.json(savedRecipe);
  } catch (error) {
    console.error('Error saving recipe:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/dropdown-data/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`API request: Get recipe dropdown data for user ${userId}`);

    if (req.user.id !== userId) {
      return res.status(403).json({
        error: 'You can only access your own recipe data',
        authenticatedUserId: req.user.id,
        requestedUserId: userId,
      });
    }

    const dropdownData = await recipeService.getRecipeDropdownData(userId);

    console.log(`Returning dropdown data for user ${userId}`);
    res.json(dropdownData);
  } catch (error) {
    console.error('Error getting recipe dropdown data:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:recipeId', async (req, res) => {
  try {
    const { recipeId } = req.params;

    console.log(`API request: Get recipe details for recipe ${recipeId}`);
    const recipeDetails = await recipeService.getRecipeDetails(recipeId);

    console.log(`Returning recipe details for ${recipeId}`);
    res.json(recipeDetails);
  } catch (error) {
    console.error('Error getting recipe details:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/saves/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`API request: Get user's saved recipes user: ${userId}`);
    const savedRecipes = await recipeService.getSavesByUserId(userId);

    console.log(`Returning saves for user ${userId}`);
    res.json(savedRecipes);
  } catch (error) {
    console.error('Error getting recipe ratings:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/recipebox/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`API request: Get user's saved recipes user: ${userId}`);
    const data = await recipeService.getRecipeBox(userId);

    console.log(`Returning saves for user ${userId}`);
    res.json(data);
  } catch (error) {
    console.error('Error getting recipe ratings:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:recipeId/ratings', async (req, res) => {
  try {
    const { recipeId } = req.params;

    console.log(`API request: Get ratings for recipe ${recipeId}`);
    const ratings = await recipeService.getRecipeRatings(recipeId);

    console.log(`Returning ratings for recipe ${recipeId}`);
    res.json(ratings);
  } catch (error) {
    console.error('Error getting recipe ratings:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:recipeId/stats', async (req, res) => {
  try {
    const { recipeId } = req.params;

    console.log(`API request: Get stats for recipe ${recipeId}`);
    const stats = await recipeService.getRecipeStats(recipeId);

    console.log(`Returning stats for recipe ${recipeId}`);
    res.json(stats);
  } catch (error) {
    console.error('Error getting recipe stats:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:recipeId/bakes', async (req, res) => {
  try {
    const { recipeId } = req.params;

    console.log(`API request: Get bakes list for recipe ${recipeId}`);
    const bakes = await recipeService.getBakesList(recipeId);

    console.log(`Returning bakes list for recipe ${recipeId}`);
    res.json(bakes);
  } catch (error) {
    console.error('Error getting bakes list:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:recipeId/update-image', async (req, res) => {
  console.log('=== UPDATE IMAGE ENDPOINT CALLED ===');
  console.log('Recipe ID:', req.params.recipeId);
  console.log('Request body:', req.body);
  console.log('Auth user:', req.user ? req.user.id : 'No auth user');

  try {
    const { recipeId } = req.params;
    const { imageUrl } = req.body;

    console.log('Extracted values:', { recipeId, imageUrl });

    if (!imageUrl) {
      console.error('No imageUrl provided in request body');
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    console.log('Calling recipeService.updateRecipeImage...');
    const updatedRecipe = await recipeService.updateRecipeImage(recipeId, imageUrl);
    console.log('Service returned:', updatedRecipe);

    res.json({
      success: true,
      message: 'Recipe image updated successfully',
      data: updatedRecipe,
    });
  } catch (error) {
    console.error('=== ERROR in update-image endpoint ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to update recipe image',
      details: error.message,
    });
  }
});

router.get('/:recipeId/saves/check/:userId', async (req, res) => {
  try {
    const { recipeId, userId } = req.params;

    console.log(`API request: Check if user ${userId} has saved recipe ${recipeId}`);
    console.log(`Authenticated user: ${req.user ? req.user.id : 'none'}`);

    if (req.user && req.user.id !== userId) {
      console.warn(`User ${req.user.id} is checking save status for ${userId}`);
    }

    const isSaved = await recipeService.checkUserSave(userId, recipeId);

    console.log(`Returning isSaved: ${isSaved}`);
    res.json({ isSaved });
  } catch (error) {
    console.error('Error checking save status:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:recipeId/saves/toggle', async (req, res) => {
  try {
    const { recipeId } = req.params;
    const { userId } = req.body;

    console.log(`API request: Toggle save for recipe ${recipeId}, user ${userId}`);
    console.log(`Request body:`, req.body);
    console.log(`Authenticated user: ${req.user ? req.user.id : 'none'}`);

    if (req.user && req.user.id !== userId) {
      console.warn(`User ${req.user.id} is trying to toggle save for ${userId}`);
      return res.status(403).json({
        error: 'You can only toggle your own saves',
        authenticatedUserId: req.user.id,
        requestedUserId: userId,
      });
    }

    const result = await recipeService.toggleSave(userId, recipeId);

    console.log(`Toggle result:`, result);
    res.json(result);
  } catch (error) {
    console.error('Error toggling save:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
