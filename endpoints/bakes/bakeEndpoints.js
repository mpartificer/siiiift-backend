const express = require('express');
const router = express.Router();
const bakeService = require('../../services/bakes/bakeService');
const multer = require('multer');
const authMiddleware = require('../../middlewares/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/analyze-bake', authMiddleware, async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://mpartificer.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  };

  if (req.method === 'OPTIONS') {
    return res.status(200).set(corsHeaders).send('ok');
  }

  try {
    const {
      imageUrls,
      recipeTitle,
      hasModifications,
      originalInstructions,
      modifiedInstructions,
      originalIngredients,
      modifiedIngredients,
    } = req.body;

    // Validate required fields
    if (!imageUrls || !Array.isArray(imageUrls)) {
      throw new Error('imageUrls must be an array');
    }

    if (!recipeTitle) {
      throw new Error('recipeTitle is required');
    }

    const insights = await bakeAnalysisService.analyzeBake({
      imageUrls,
      recipeTitle,
      hasModifications,
      originalInstructions,
      modifiedInstructions,
      originalIngredients,
      modifiedIngredients,
    });

    return res
      .status(200)
      .set({ ...corsHeaders, 'Content-Type': 'application/json' })
      .json({ insights });
  } catch (error) {
    console.error('Error in analyze-bake endpoint:', error);
    return res
      .status(500)
      .set({ ...corsHeaders, 'Content-Type': 'application/json' })
      .json({
        error: error.message,
        stack: error.stack,
      });
  }
});

router.get('/history/:username/:recipeId', async (req, res) => {
  try {
    const { username, recipeId } = req.params;

    console.log(`Bake history request:
        - URL: ${req.originalUrl}
        - Username: ${username}
        - RecipeId: ${recipeId}
        - Authenticated: ${!!req.user}
      `);

    if (!username || !recipeId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const currentUserAuthId = req.user ? req.user.id : null;
    console.log(`Current user auth ID: ${currentUserAuthId || 'Not authenticated'}`);

    const bakeHistory = await bakeService.getBakeHistory(username, recipeId, currentUserAuthId);

    res.json(bakeHistory);
  } catch (error) {
    console.error('Error fetching bake history:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Missing User ID' });
    }
    const userBakeHistory = await bakeService.getUsersBakes(userId);
    console.log('im bake history', userBakeHistory);

    res.json({ success: true, data: userBakeHistory });
  } catch (error) {
    console.error('Error fetching bake history:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/post-bake', upload.array('files'), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token required',
      });
    }

    const token = authHeader.split(' ')[1];
    const files = req.files;

    const formData = JSON.parse(req.body.data || '{}');

    const {
      userId,
      rating,
      bakeDate,
      recipeId,
      recipeTitle,
      ingredientModifications,
      instructionModifications,
    } = formData;

    const result = await bakeService.createBakePost({
      token,
      userId,
      files,
      rating,
      bakeDate,
      recipeId,
      recipeTitle,
      ingredientModifications,
      instructionModifications,
    });

    return res.status(201).json({
      success: true,
      data: result,
      message: 'Bake posted successfully. AI analysis in progress.',
    });
  } catch (error) {
    console.error('Error in post-bake endpoint:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to post bake',
    });
  }
});

router.get('/home', async (req, res) => {
  try {
    console.log(`Home feed request:
        - URL: ${req.originalUrl}
        - Authenticated: ${!!req.user}
      `);

    const currentUserAuthId = req.user ? req.user.id : null;
    console.log(`Current user auth ID: ${currentUserAuthId || 'Not authenticated'}`);

    const homeFeed = await bakeService.getHomeFeed(currentUserAuthId);

    console.log(homeFeed);

    res.json(homeFeed);
  } catch (error) {
    console.error('Error fetching home feed:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
