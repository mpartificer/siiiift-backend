const express = require('express');
const router = express.Router();
const userService = require('../../services/users/userService');

router.get('/:userId/followers', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const followers = await userService.getFollowers(userId);
    res.json({
      success: true,
      data: followers,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:userId/following', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const following = await userService.getFollowing(userId);
    res.json({
      success: true,
      data: following,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:userId/profile', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const profile = await userService.getUserProfile(userId);
    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:userId/follow', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const followerId = req.user.id;

    await userService.followUser(followerId, userId);
    res.json({
      success: true,
      message: 'User followed successfully',
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:userId/follow', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const followerId = req.user.id;

    await userService.unfollowUser(followerId, userId);
    res.json({
      success: true,
      message: 'User unfollowed successfully',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
