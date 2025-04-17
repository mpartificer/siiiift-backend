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

module.exports = router;
