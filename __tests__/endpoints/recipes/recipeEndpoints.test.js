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

describe('Recipe Endpoints - POST /store-recipe', () => {
  let testUserId;
  let storedRecipeIds = [];

  function createAppWithAuth(userId) {
    const testApp = express();
    testApp.use(express.json());

    testApp.use((req, res, next) => {
      req.user = { id: userId };
      next();
    });

    testApp.use('/recipes', recipeEndpoints);
    return testApp;
  }

  beforeEach(async () => {
    const { randomUUID } = require('crypto');
    testUserId = randomUUID();
    storedRecipeIds = [];
  });

  afterEach(async () => {
    await cleanupStoredRecipes();
  });

  async function cleanupStoredRecipes() {
    const { supabase } = require('../../../supabaseClient');

    for (const recipeId of storedRecipeIds) {
      try {
        await supabase.from('recipe_profile').delete().eq('id', recipeId);
        console.log(`Cleaned up stored recipe: ${recipeId}`);
      } catch (error) {
        console.error(`Error cleaning up recipe ${recipeId}:`, error);
      }
    }
  }

  describe('Successful recipe storage', () => {
    test('should store recipe with valid data', async () => {
      const app = createAppWithAuth(testUserId);

      const recipeData = {
        title: 'Test Stored Recipe',
        ingredients: ['1 cup flour', '2 eggs', '1 cup milk'],
        instructions: ['Mix ingredients', 'Cook in pan', 'Serve hot'],
        prep_time: '10 minutes',
        cook_time: '15 minutes',
        total_time: '25 minutes',
        original_link: 'https://test-recipe-store.com',
      };

      const requestData = {
        userId: testUserId,
        recipeData: recipeData,
      };

      const response = await request(app)
        .post('/recipes/store-recipe')
        .send(requestData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('title', recipeData.title);
      expect(response.body).toHaveProperty('ingredients');
      expect(response.body).toHaveProperty('instructions');
      expect(response.body.prep_time).toBe(recipeData.prep_time);
      expect(response.body.cook_time).toBe(recipeData.cook_time);
      expect(response.body.total_time).toBe(recipeData.total_time);

      storedRecipeIds.push(response.body.id);

      const { supabase } = require('../../../supabaseClient');
      const { data: storedRecipe, error } = await supabase
        .from('recipe_profile')
        .select('*')
        .eq('id', response.body.id)
        .single();

      expect(error).toBeNull();
      expect(storedRecipe.title).toBe(recipeData.title);
      expect(storedRecipe.ingredients).toEqual(recipeData.ingredients);
      expect(storedRecipe.instructions).toEqual(recipeData.instructions);
    });

    test('should store recipe with minimal data', async () => {
      const app = createAppWithAuth(testUserId);

      const recipeData = {
        title: 'Minimal Recipe',
        ingredients: ['ingredient 1'],
        instructions: ['step 1'],
      };

      const requestData = {
        userId: testUserId,
        recipeData: recipeData,
      };

      const response = await request(app)
        .post('/recipes/store-recipe')
        .send(requestData)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(recipeData.title);

      storedRecipeIds.push(response.body.id);

      const { supabase } = require('../../../supabaseClient');
      const { data: storedRecipe } = await supabase
        .from('recipe_profile')
        .select('*')
        .eq('id', response.body.id)
        .single();

      expect(storedRecipe.title).toBe(recipeData.title);
      expect(storedRecipe.ingredients).toEqual(recipeData.ingredients);
      expect(storedRecipe.instructions).toEqual(recipeData.instructions);
    });

    test('should handle recipe with no title (uses default)', async () => {
      const app = createAppWithAuth(testUserId);

      const recipeData = {
        ingredients: ['test ingredient'],
        instructions: ['test instruction'],
        prep_time: '5 minutes',
      };

      const requestData = {
        userId: testUserId,
        recipeData: recipeData,
      };

      const response = await request(app)
        .post('/recipes/store-recipe')
        .send(requestData)
        .expect(200);

      expect(response.body.title).toBe('Untitled Recipe');

      storedRecipeIds.push(response.body.id);
    });

    test('should store recipe with special characters and emojis', async () => {
      const app = createAppWithAuth(testUserId);

      const recipeData = {
        title: 'Spécial Recipe with Émojis 🍰🎂',
        ingredients: ['1 cup "special" flour', '2 eggs (large)', 'Salt & pepper'],
        instructions: ['Mix with <love>', 'Bake @ 350°F', 'Enjoy! 😋'],
        prep_time: '15 minutes',
        original_link: 'https://special-chars.com/recipe?id=123&type=dessert',
      };

      const requestData = {
        userId: testUserId,
        recipeData: recipeData,
      };

      const response = await request(app)
        .post('/recipes/store-recipe')
        .send(requestData)
        .expect(200);

      expect(response.body.title).toBe(recipeData.title);

      storedRecipeIds.push(response.body.id);

      const { supabase } = require('../../../supabaseClient');
      const { data: storedRecipe } = await supabase
        .from('recipe_profile')
        .select('*')
        .eq('id', response.body.id)
        .single();

      expect(storedRecipe.title).toBe(recipeData.title);
      expect(storedRecipe.ingredients).toEqual(recipeData.ingredients);
      expect(storedRecipe.instructions).toEqual(recipeData.instructions);
    });
  });

  describe('Authentication and authorization', () => {
    test('should reject request when userId does not match authenticated user', async () => {
      const differentUserId = require('crypto').randomUUID();
      const app = createAppWithAuth(testUserId);

      const recipeData = {
        title: 'Unauthorized Recipe',
        ingredients: ['ingredient'],
        instructions: ['instruction'],
      };

      const requestData = {
        userId: differentUserId,
        recipeData: recipeData,
      };

      const response = await request(app)
        .post('/recipes/store-recipe')
        .send(requestData)
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Unauthorized action');
      expect(response.body).toHaveProperty('authenticatedUserId', testUserId);
      expect(response.body).toHaveProperty('requestedUserId', differentUserId);
    });

    test('should handle missing authentication', async () => {
      const noAuthApp = express();
      noAuthApp.use(express.json());
      noAuthApp.use('/recipes', recipeEndpoints);

      const recipeData = {
        title: 'Test Recipe',
        ingredients: ['ingredient'],
        instructions: ['instruction'],
      };

      const requestData = {
        userId: testUserId,
        recipeData: recipeData,
      };

      const response = await request(noAuthApp).post('/recipes/store-recipe').send(requestData);

      expect(response.status).toBe(500);
    });
  });

  describe('Error handling', () => {
    test('should handle missing userId in request', async () => {
      const app = createAppWithAuth(testUserId);

      const recipeData = {
        title: 'Recipe without userId',
        ingredients: ['ingredient'],
        instructions: ['instruction'],
      };

      const requestData = {
        recipeData: recipeData,
      };

      const response = await request(app)
        .post('/recipes/store-recipe')
        .send(requestData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle missing recipeData in request', async () => {
      const app = createAppWithAuth(testUserId);

      const requestData = {
        userId: testUserId,
      };

      const response = await request(app)
        .post('/recipes/store-recipe')
        .send(requestData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle service layer errors', async () => {
      const app = createAppWithAuth(testUserId);

      const recipeData = {
        title: null,
        ingredients: null,
        instructions: null,
      };

      const requestData = {
        userId: testUserId,
        recipeData: recipeData,
      };

      const response = await request(app).post('/recipes/store-recipe').send(requestData);

      if (response.status !== 200) {
        expect(response.body).toHaveProperty('error');
        expect(typeof response.body.error).toBe('string');
      }

      if (response.status === 200 && response.body.id) {
        storedRecipeIds.push(response.body.id);
      }
    });
  });

  describe('Database integration', () => {
    test('should generate unique IDs for multiple recipes', async () => {
      const app = createAppWithAuth(testUserId);

      const recipe1Data = {
        title: 'Recipe 1',
        ingredients: ['ingredient 1'],
        instructions: ['instruction 1'],
      };

      const recipe2Data = {
        title: 'Recipe 2',
        ingredients: ['ingredient 2'],
        instructions: ['instruction 2'],
      };

      const response1 = await request(app)
        .post('/recipes/store-recipe')
        .send({ userId: testUserId, recipeData: recipe1Data })
        .expect(200);

      const response2 = await request(app)
        .post('/recipes/store-recipe')
        .send({ userId: testUserId, recipeData: recipe2Data })
        .expect(200);

      expect(response1.body.id).not.toBe(response2.body.id);

      storedRecipeIds.push(response1.body.id, response2.body.id);

      const { supabase } = require('../../../supabaseClient');
      const { data: recipes, error } = await supabase
        .from('recipe_profile')
        .select('*')
        .in('id', [response1.body.id, response2.body.id]);

      expect(error).toBeNull();
      expect(recipes).toHaveLength(2);
    });

    test('should handle large recipe data', async () => {
      const app = createAppWithAuth(testUserId);

      const recipeData = {
        title: 'Very Detailed Recipe with Long Title That Tests Database Limits',
        ingredients: Array.from(
          { length: 50 },
          (_, i) => `Ingredient ${i + 1} with detailed description`
        ),
        instructions: Array.from(
          { length: 30 },
          (_, i) =>
            `Step ${i + 1}: Very detailed instruction that explains exactly what to do in this step of the cooking process`
        ),
        prep_time: '2 hours 30 minutes',
        cook_time: '4 hours 15 minutes',
        total_time: '6 hours 45 minutes',
        original_link:
          'https://very-long-domain-name-for-testing.com/recipe/very-detailed-recipe-with-long-url?param1=value1&param2=value2',
      };

      const requestData = {
        userId: testUserId,
        recipeData: recipeData,
      };

      const response = await request(app)
        .post('/recipes/store-recipe')
        .send(requestData)
        .expect(200);

      expect(response.body.ingredients).toHaveLength(50);
      expect(response.body.instructions).toHaveLength(30);

      storedRecipeIds.push(response.body.id);
    });
  });
});
