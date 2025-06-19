const express = require('express');
const router = express.Router();
const engagementService = require('../../services/engagementServices');
const userService = require('../../services/users/userService');
const recipeService = require('../../services/recipes/recipeService');

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

router.get('/search/:searchTerm', async (req, res, next) => {
  try {
    const { searchTerm } = req.params;

    console.log(`API request: Search for "${searchTerm}"`);
    console.log(`Authenticated user: ${req.user ? req.user.id : 'none'}`);

    const [users, recipes] = await Promise.all([
      userService.searchUsers(searchTerm),
      recipeService.searchRecipes(searchTerm),
    ]);

    console.log(`Search results: ${users.length} users, ${recipes.length} recipes`);

    const normalizedUsers = users.map((user) => {
      if (!user.userId && user.id) {
        user.userId = user.id;
      }

      console.log(
        `Normalized user: id=${user.id}, userId=${user.userId}, username=${user.username}`
      );

      return user;
    });

    const normalizedRecipes = recipes.map((recipe) => {
      if (!recipe.recipeId && recipe.id) {
        recipe.recipeId = recipe.id;
      }

      console.log(
        `Normalized recipe: id=${recipe.id}, recipeId=${recipe.recipeId}, title=${recipe.title}`
      );

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

module.exports = router;
