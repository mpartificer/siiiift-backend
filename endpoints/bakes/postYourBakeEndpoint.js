const express = require('express');
const router = express.Router();
const multer = require('multer');
const bakeService = require('../../services/bakes/postYourBakeService.js');

const storage = multer.memoryStorage();
const upload = multer({ storage });

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

module.exports = router;
