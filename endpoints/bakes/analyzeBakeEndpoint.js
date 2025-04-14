const express = require('express');
const router = express.Router();
const bakeAnalysisService = require('../../services/bakes/bakeAnalysisService.js');
const authMiddleware = require('../../middlewares/authMiddleware');

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

module.exports = router;
