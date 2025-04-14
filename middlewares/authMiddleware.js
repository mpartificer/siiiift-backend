const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Missing Supabase credentials in environment variables');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const authMiddleware = async (req, res, next) => {
  console.log(`Auth check for: ${req.method} ${req.originalUrl}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Missing or invalid Authorization header');
    return res.status(401).json({
      success: false,
      message: 'Auth session missing!',
    });
  }

  const token = authHeader.split(' ')[1];
  console.log('Token found, verifying with Supabase');

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error('Supabase auth error:', error);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    if (!data.user) {
      console.log('No user found for token');
      return res.status(401).json({
        success: false,
        message: 'No user found for token',
      });
    }

    console.log(`User authenticated: ${data.user.id}`);
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
    });
  }
};

module.exports = authMiddleware;
