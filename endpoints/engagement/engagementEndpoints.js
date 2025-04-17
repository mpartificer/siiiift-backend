const express = require('express');
const router = express.Router();
const engagementService = require('../../services/engagementServices');

router.get('/like/count/:bakeId', async (req, res) => {
  try {
    const { bakeId } = req.params;

    console.log(`API request: Get like count for bake ${bakeId}`);
    const likeCount = await engagementService.getLikeCount(bakeId);

    console.log(`Returning like count: ${likeCount}`);
    res.json({ likeCount });
  } catch (error) {
    console.error('Error getting like count:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/like/check/:userId/:bakeId', async (req, res) => {
  try {
    const { userId, bakeId } = req.params;

    console.log(`API request: Check if user ${userId} liked bake ${bakeId}`);
    console.log(`Authenticated user: ${req.user ? req.user.id : 'none'}`);

    if (req.user && req.user.id !== userId) {
      console.warn(`User ${req.user.id} is checking like status for ${userId}`);
    }

    const isLiked = await engagementService.checkUserLike(userId, bakeId);

    console.log(`Returning isLiked: ${isLiked}`);
    res.json({ isLiked });
  } catch (error) {
    console.error('Error checking like status:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/like/:bakeId', async (req, res) => {
  try {
    const { bakeId } = req.params;
    const { userId, recipeId } = req.body;

    console.log(`API request: Toggle like for bake ${bakeId}, user ${userId}, recipe ${recipeId}`);
    console.log(`Request body:`, req.body);

    console.log(`Authenticated user: ${req.user ? req.user.id : 'none'}`);

    if (req.user && req.user.id !== userId) {
      console.warn(`User ${req.user.id} is trying to toggle like for ${userId}`);
      return res.status(403).json({
        error: 'You can only toggle your own likes',
        authenticatedUserId: req.user.id,
        requestedUserId: userId,
      });
    }

    const result = await engagementService.toggleLike(userId, bakeId, recipeId);

    console.log(`Toggle result:`, result);
    res.json(result);
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/search/:searchTerm', async (req, res) => {
  try {
    const { searchTerm } = req.params;

    console.log(`API request: Returning search results: ${searchTerm}`);
    const searchResults = await engagementService.getSearchResults(searchTerm);

    console.log(`Searching for ${searchTerm}`);
    res.json(searchResults);
  } catch (error) {
    console.error('Error getting recipe ratings:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
