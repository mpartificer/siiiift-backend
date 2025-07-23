require('dotenv').config({ path: '.env.test' });
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const engagementEndpoints = require('../../../endpoints/engagement/engagementEndpoints');

describe('Engagement Endpoints - GET /search/:searchTerm', () => {
  let app;
  let testRecipeId;
  let testUserId;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      req.user = { id: testUserId };
      next();
    });

    app.use('/engagement', engagementEndpoints);
  });

  beforeEach(async () => {
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  async function setupTestData() {
    const { supabase } = require('../../../supabaseClient');

    const { randomUUID } = require('crypto');
    testUserId = randomUUID();

    const testUserData = {
      user_auth_id: testUserId,
      username: 'testsearchuser',
      bio: 'Test user for search',
      photo: 'https://example.com/test-photo.jpg',
    };

    const { data: userData, error: userError } = await supabase
      .from('user_profile')
      .upsert([testUserData])
      .select()
      .single();

    if (userError) {
      console.error('Error creating test user:', userError);
      throw userError;
    }

    const testRecipeData = {
      title: 'Test Search Recipe',
      ingredients: ['search ingredient 1', 'search ingredient 2'],
      instructions: ['search step 1', 'search step 2'],
      prep_time: '10 minutes',
      cook_time: '20 minutes',
      total_time: '30 minutes',
      original_link: 'https://test-search-recipe.com',
    };

    const { data: recipeData, error: recipeError } = await supabase
      .from('recipe_profile')
      .insert([testRecipeData])
      .select()
      .single();

    if (recipeError) throw recipeError;
    testRecipeId = recipeData.id;
  }

  async function cleanupTestData() {
    const { supabase } = require('../../../supabaseClient');

    if (testRecipeId) {
      await supabase.from('recipe_profile').delete().eq('id', testRecipeId);
    }

    if (testUserId) {
      await supabase.from('user_profile').delete().eq('user_auth_id', testUserId);
    }
  }

  describe('Successful search', () => {
    test('should return search results for users and recipes', async () => {
      const searchTerm = 'test';

      const response = await request(app).get(`/engagement/search/${searchTerm}`).expect(200);

      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('recipes');
      expect(response.body).toHaveProperty('all');

      expect(Array.isArray(response.body.users)).toBe(true);
      expect(Array.isArray(response.body.recipes)).toBe(true);
      expect(Array.isArray(response.body.all)).toBe(true);

      const foundUser = response.body.users.find((user) => user.username === 'testsearchuser');
      expect(foundUser).toBeDefined();
      expect(foundUser).toMatchObject({
        id: testUserId,
        userId: testUserId,
        username: 'testsearchuser',
        type: 'user',
      });

      const foundRecipe = response.body.recipes.find(
        (recipe) => recipe.title === 'Test Search Recipe'
      );
      expect(foundRecipe).toBeDefined();
      expect(foundRecipe).toMatchObject({
        id: testRecipeId,
        recipeId: testRecipeId,
        title: 'Test Search Recipe',
        type: 'recipe',
      });

      expect(response.body.all.length).toBeGreaterThanOrEqual(2);
      const allUserIds = response.body.all.map((item) => item.id || item.userId);
      const allRecipeIds = response.body.all.map((item) => item.id || item.recipeId);

      expect(allUserIds).toContain(testUserId);
      expect(allRecipeIds).toContain(testRecipeId);
    });

    test('should handle case-insensitive search', async () => {
      const searchTerm = 'SEARCH';

      const response = await request(app).get(`/engagement/search/${searchTerm}`).expect(200);

      const foundRecipe = response.body.recipes.find((recipe) =>
        recipe.title.toLowerCase().includes('search')
      );
      expect(foundRecipe).toBeDefined();
    });

    test('should return empty arrays for non-matching search', async () => {
      const searchTerm = 'nonexistentsearchterm12345';

      const response = await request(app).get(`/engagement/search/${searchTerm}`).expect(200);

      expect(response.body.users).toEqual([]);
      expect(response.body.recipes).toEqual([]);
      expect(response.body.all).toEqual([]);
    });

    test('should handle partial matches', async () => {
      const searchTerm = 'testsear';

      const response = await request(app).get(`/engagement/search/${searchTerm}`).expect(200);

      const hasPartialUserMatch = response.body.users.some((user) =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase())
      );
      const hasPartialRecipeMatch = response.body.recipes.some((recipe) =>
        recipe.title.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(hasPartialUserMatch || hasPartialRecipeMatch).toBe(true);
    });
  });

  describe('Response format validation', () => {
    test('should normalize user objects correctly', async () => {
      const response = await request(app).get('/engagement/search/test').expect(200);

      response.body.users.forEach((user) => {
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('userId');
        expect(user).toHaveProperty('username');
        expect(user).toHaveProperty('type', 'user');

        expect(user.userId).toBe(user.id);
      });
    });

    test('should normalize recipe objects correctly', async () => {
      const response = await request(app).get('/engagement/search/test').expect(200);

      response.body.recipes.forEach((recipe) => {
        expect(recipe).toHaveProperty('id');
        expect(recipe).toHaveProperty('recipeId');
        expect(recipe).toHaveProperty('title');
        expect(recipe).toHaveProperty('type', 'recipe');

        expect(recipe.recipeId).toBe(recipe.id);
      });
    });
  });

  describe('Error handling', () => {
    test('should handle special characters in search term', async () => {
      const searchTerm = 'test@#$%';

      const response = await request(app)
        .get(`/engagement/search/${encodeURIComponent(searchTerm)}`)
        .expect(200);

      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('recipes');
      expect(response.body).toHaveProperty('all');
    });

    test('should handle very long search terms', async () => {
      const searchTerm = 'a'.repeat(100);

      const response = await request(app)
        .get(`/engagement/search/${encodeURIComponent(searchTerm)}`)
        .expect(200);

      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('recipes');
    });
  });
});
