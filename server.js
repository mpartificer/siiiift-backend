const express = require('express');
const cors = require('cors');
require('dotenv').config();
const analyzeBakeEndpoint = require('./endpoints/bakes/analyzeBakeEndpoint.js');
const postYourBakeEndpoint = require('./endpoints/bakes/postYourBakeEndpoint.js');
const bakeEndpoints = require('./endpoints/bakes/bakeEndpoints');
const engagementEndpoints = require('./endpoints/engagement/engagementEndpoints.js');
const followingEndpoints = require('./endpoints/following/followingEndpoints.js');
const authMiddleware = require('./middlewares/authMiddleware');

const app = express();
const PORT = process.env.PORT;

const corsOptions = {
  origin: ['https://mpartificer.github.io', 'http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 204,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-client-info', 'apikey'],
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', authMiddleware, postYourBakeEndpoint);
app.use('/api', authMiddleware, analyzeBakeEndpoint);
app.use('/api/bakes', authMiddleware, bakeEndpoints);
app.use('/api/engagement', authMiddleware, engagementEndpoints);
app.use('/api/follows', authMiddleware, followingEndpoints);

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'werk' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
