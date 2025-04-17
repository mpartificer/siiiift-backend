const express = require('express');
const router = express.Router();
const multer = require('multer');
const userService = require('../../services/users/userService');

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.put('/bio', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { bio } = req.body;

    if (typeof bio !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Bio must be a string',
      });
    }

    const updatedProfile = await userService.updateUserProfile(userId, { bio });

    res.json({
      success: true,
      data: updatedProfile,
      message: 'Bio updated successfully',
    });
  } catch (error) {
    console.error('Error updating bio:', error);
    next(error);
  }
});

router.put('/photo', upload.single('photo'), async (req, res, next) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `profiles/${userId}-${uuidv4()}.${fileExt}`;

    const publicUrl = await uploadFile('Bake_Image', fileName, req.file.buffer, {
      contentType: req.file.mimetype,
    });

    const updatedProfile = await userService.updateUserProfile(userId, { photo: publicUrl });

    res.json({
      success: true,
      data: {
        photo: publicUrl,
        profile: updatedProfile,
      },
      message: 'Profile photo updated successfully',
    });
  } catch (error) {
    console.error('Error updating profile photo:', error);
    next(error);
  }
});

router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    console.log(`Fetching user details for userId: ${userId}`);

    const user = await userService.getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
      message: 'User details retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    next(error);
  }
});

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

router.get('/:userId/following/check/:targetUserId', async (req, res, next) => {
  try {
    const { userId, targetUserId } = req.params;

    console.log(`API request: Check if user ${userId} is following user ${targetUserId}`);
    console.log(`Authenticated user: ${req.user ? req.user.id : 'none'}`);

    if (req.user && req.user.id !== userId) {
      console.warn(`User ${req.user.id} is checking follow status for ${userId}`);
    }

    const isFollowing = await userService.checkFollowing(userId, targetUserId);

    console.log(`Returning isFollowing: ${isFollowing}`);
    res.json({ isFollowing });
  } catch (error) {
    console.error('Error checking follow status:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/follow/toggle', async (req, res, next) => {
  try {
    const { followerId, followingId } = req.body;

    console.log(`API request: Toggle follow for follower ${followerId}, following ${followingId}`);
    console.log(`Request body:`, JSON.stringify(req.body));
    console.log(`Authenticated user: ${req.user ? req.user.id : 'none'}`);

    if (!followerId || !followingId) {
      const missingParams = [];
      if (!followerId) missingParams.push('followerId');
      if (!followingId) missingParams.push('followingId');

      const errorMsg = `Missing required parameters: ${missingParams.join(', ')}`;
      console.error(errorMsg);
      return res.status(400).json({
        error: errorMsg,
        receivedParams: req.body,
      });
    }

    if (req.user && req.user.id !== followerId) {
      console.warn(`User ${req.user.id} is trying to toggle follow for ${followerId}`);
      return res.status(403).json({
        error: 'You can only toggle your own follow status',
        authenticatedUserId: req.user.id,
        requestedFollowerId: followerId,
      });
    }

    const isFollowing = await userService.checkFollowing(followerId, followingId);
    console.log(
      `Current follow status: User ${followerId} is following ${followingId}: ${isFollowing}`
    );

    if (isFollowing) {
      console.log(`Unfollowing: User ${followerId} will unfollow ${followingId}`);
      await userService.unfollowUser(followerId, followingId);
      res.json({
        isFollowing: false,
        message: 'Successfully unfollowed user',
      });
    } else {
      console.log(`Following: User ${followerId} will follow ${followingId}`);
      await userService.followUser(followerId, followingId);
      res.json({
        isFollowing: true,
        message: 'Successfully followed user',
      });
    }
  } catch (error) {
    console.error('Error toggling follow status:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
