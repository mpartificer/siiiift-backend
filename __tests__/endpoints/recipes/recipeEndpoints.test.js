const request = require('supertest');
const express = require('express');
const recipeEndpoints = require('../../../endpoints/recipes/recipeEndpoints');

describe('Recipe Endpoints - GET /:recipeId', () => {
  let app;
  let testRecipeId;
  let testUserId;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      req.user = { id: 'test-user-123' };
      next();
    });

    app.use('/recipes', recipeEndpoints);
  });

  beforeEach(async () => {
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  async function setupTestData() {
    testUserId = 'test-user-123';

    const { supabase } = require('../../../supabaseClient');

    const testRecipeData = {
      title: 'Test Recipe for Integration',
      ingredients: ['2 cups flour', '1 cup sugar', '3 eggs'],
      instructions: ['Mix dry ingredients', 'Add wet ingredients', 'Bake at 350°F'],
      prep_time: '15 minutes',
      cook_time: '30 minutes',
      total_time: '45 minutes',
      original_link: 'https://test-recipe.com',
      images: ['https://example.com/test-image.jpg'],
    };

    const { data, error } = await supabase
      .from('recipe_profile')
      .insert([testRecipeData])
      .select()
      .single();

    if (error) throw error;
    testRecipeId = data.id;

    console.log(`Created test recipe with ID: ${testRecipeId}`);
  }

  async function cleanupTestData() {
    if (testRecipeId) {
      const { supabase } = require('../../../supabaseClient');

      await supabase.from('recipe_profile').delete().eq('id', testRecipeId);

      console.log(`Cleaned up test recipe: ${testRecipeId}`);
      testRecipeId = null;
    }
  }

  async function teardownTestDatabase() {
    console.log('Test database teardown complete');
  }

  describe('Successful retrieval', () => {
    test('should return recipe details for valid recipe ID', async () => {
      const response = await request(app).get(`/recipes/${testRecipeId}`).expect(200);

      expect(response.body).toMatchObject({
        id: testRecipeId,
        title: 'Test Recipe for Integration',
        ingredients: expect.arrayContaining(['2 cups flour', '1 cup sugar', '3 eggs']),
        instructions: expect.arrayContaining([
          'Mix dry ingredients',
          'Add wet ingredients',
          'Bake at 350°F',
        ]),
        prep_time: '15 minutes',
        cook_time: '30 minutes',
        total_time: '45 minutes',
        original_link: 'https://test-recipe.com',
      });

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('title');
      expect(Array.isArray(response.body.ingredients)).toBe(true);
      expect(Array.isArray(response.body.instructions)).toBe(true);
    });

    test('should return recipe with all expected fields', async () => {
      const response = await request(app).get(`/recipes/${testRecipeId}`).expect(200);

      const expectedFields = [
        'id',
        'title',
        'ingredients',
        'instructions',
        'prep_time',
        'cook_time',
        'total_time',
        'original_link',
      ];

      expectedFields.forEach((field) => {
        expect(response.body).toHaveProperty(field);
      });
    });
  });

  describe('Error handling', () => {
    test('should return 500 for non-existent recipe ID', async () => {
      const nonExistentId = 'non-existent-recipe-id-12345';

      const response = await request(app).get(`/recipes/${nonExistentId}`).expect(500);

      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });

    test('should handle malformed recipe ID', async () => {
      const malformedId = 'invalid-uuid-format';

      const response = await request(app).get(`/recipes/${malformedId}`).expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Database integration', () => {
    test('should actually fetch data from test database', async () => {
      const response = await request(app).get(`/recipes/${testRecipeId}`).expect(200);

      expect(response.body.id).toBe(testRecipeId);

      expect(response.body.title).toBe('Test Recipe for Integration');
    });

    test('should maintain data consistency across requests', async () => {
      const response1 = await request(app).get(`/recipes/${testRecipeId}`).expect(200);

      const response2 = await request(app).get(`/recipes/${testRecipeId}`).expect(200);

      expect(response1.body).toEqual(response2.body);
    });
  });
});
