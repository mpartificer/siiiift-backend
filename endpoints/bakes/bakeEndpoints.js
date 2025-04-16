const express = require('express');
const router = express.Router();
const bakeService = require('../../services/bakes/bakeService');

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

router.get('/home', async (req, res) => {
  try {
    console.log(`Home feed request:
        - URL: ${req.originalUrl}
        - Authenticated: ${!!req.user}
      `);

    const currentUserAuthId = req.user ? req.user.id : null;
    console.log(`Current user auth ID: ${currentUserAuthId || 'Not authenticated'}`);

    const homeFeed = await bakeService.getHomeFeed(currentUserAuthId);

    res.json(homeFeed);
  } catch (error) {
    console.error('Error fetching home feed:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
