const express = require('express');
const router = express.Router();
const recipeService = require('../../services/recipes/recipeService');

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
