const { supabase } = require('../supabaseClient');

const authMiddleware = async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Auth session missing!',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error('Supabase auth error:', error);
      const isExpired =
        error.message && (error.message.includes('expired') || error.message.includes('invalid'));

      return res.status(401).json({
        success: false,
        message: isExpired ? 'Token has expired, please log in again' : 'Invalid token',
        error: error.message,
      });
    }

    if (!data || !data.user) {
      return res.status(401).json({
        success: false,
        message: 'No user found for token',
      });
    }

    req.user = {
      id: data.user.id,
      email: data.user.email,
    };

    next();
  } catch (error) {
    console.error('Exception during authentication:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed due to server error',
      error: error.message,
    });
  }
};

module.exports = authMiddleware;
