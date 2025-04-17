const express = require('express');
const router = express.Router();
const userService = require('../services/users/userService');

router.get('/check/:username', async (req, res, next) => {
  try {
    const { username } = req.params;
    const data = await userService.checkUsernameAvailability(username);
    res.json({
      success: true,
      data: data,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
