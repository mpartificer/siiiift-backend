const express = require('express');
const router = express.Router();
const engagementService = require('../../services/engagementServices');
const userService = require('../../services/users/userService');
const recipeService = require('../../services/recipes/recipeService');

router.get('/like/count/:bakeId', async (req, res) => {
  try {
    const { bakeId } = req.params;

    const likeCount = await engagementService.getLikeCount(bakeId);

    res.json({ likeCount });
  } catch (error) {
    console.error('Error getting like count:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/search/:searchTerm', async (req, res, next) => {
  try {
    const { searchTerm } = req.params;

    const [users, recipes] = await Promise.all([
      userService.searchUsers(searchTerm),
      recipeService.searchRecipes(searchTerm),
    ]);

    const normalizedUsers = users.map((user) => {
      if (!user.userId && user.id) {
        user.userId = user.id;
      }

      return user;
    });

    const normalizedRecipes = recipes.map((recipe) => {
      if (!recipe.recipeId && recipe.id) {
        recipe.recipeId = recipe.id;
      }

      return recipe;
    });

    res.json({
      users: normalizedUsers,
      recipes: normalizedRecipes,
      all: [...normalizedUsers, ...normalizedRecipes],
    });
  } catch (error) {
    console.error('Error searching:', error);
    next(error);
  }
});

router.get('/like/check/:userId/:bakeId', async (req, res) => {
  try {
    const { userId, bakeId } = req.params;

    if (req.user && req.user.id !== userId) {
      console.warn(`User ${req.user.id} is checking like status for ${userId}`);
    }

    const isLiked = await engagementService.checkUserLike(userId, bakeId);

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

    if (req.user && req.user.id !== userId) {
      console.warn(`User ${req.user.id} is trying to toggle like for ${userId}`);
      return res.status(403).json({
        error: 'You can only toggle your own likes',
        authenticatedUserId: req.user.id,
        requestedUserId: userId,
      });
    }

    const result = await engagementService.toggleLike(userId, bakeId, recipeId);

    res.json(result);
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
