require('dotenv').config({ path: '.env.test' });
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const userEndpoints = require('../../../endpoints/users/userEndpoints');

describe('User Endpoints - PUT /bio', () => {
  let app;
  let testUserId;

  function createAppWithAuth(userId) {
    const testApp = express();
    testApp.use(express.json());

    testApp.use((req, res, next) => {
      req.user = { id: userId };
      next();
    });

    testApp.use('/users', userEndpoints);
    return testApp;
  }

  beforeEach(async () => {
    await setupTestData();

    app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      req.user = { id: testUserId };
      next();
    });

    app.use('/users', userEndpoints);
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
      username: 'testbiouser',
      bio: 'Original bio for testing',
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
  }

  async function cleanupTestData() {
    const { supabase } = require('../../../supabaseClient');

    if (testUserId) {
      await supabase.from('user_profile').delete().eq('user_auth_id', testUserId);
    }
  }

  describe('Successful bio updates', () => {
    test('should update user bio with valid data', async () => {
      const newBio = 'This is my updated bio for testing!';

      const response = await request(app).put('/users/bio').send({ bio: newBio }).expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Bio updated successfully');
      expect(response.body).toHaveProperty('data');

      const { supabase } = require('../../../supabaseClient');
      const { data: updatedUser, error } = await supabase
        .from('user_profile')
        .select('bio')
        .eq('user_auth_id', testUserId)
        .single();

      expect(error).toBeNull();
      expect(updatedUser.bio).toBe(newBio);
    });

    test('should handle empty bio string', async () => {
      const newBio = '';

      const response = await request(app).put('/users/bio').send({ bio: newBio }).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Bio updated successfully');

      const { supabase } = require('../../../supabaseClient');
      const { data: updatedUser } = await supabase
        .from('user_profile')
        .select('bio')
        .eq('user_auth_id', testUserId)
        .single();

      expect(updatedUser.bio).toBe('');
    });

    test('should handle long bio text', async () => {
      const longBio = 'A'.repeat(500);

      const response = await request(app).put('/users/bio').send({ bio: longBio }).expect(200);

      expect(response.body.success).toBe(true);

      const { supabase } = require('../../../supabaseClient');
      const { data: updatedUser } = await supabase
        .from('user_profile')
        .select('bio')
        .eq('user_auth_id', testUserId)
        .single();

      expect(updatedUser.bio).toBe(longBio);
      expect(updatedUser.bio.length).toBe(500);
    });

    test('should handle bio with special characters', async () => {
      const specialBio = 'Bio with émojis 🎉 and special chars: @#$%&*()!';

      const response = await request(app).put('/users/bio').send({ bio: specialBio }).expect(200);

      expect(response.body.success).toBe(true);

      const { supabase } = require('../../../supabaseClient');
      const { data: updatedUser } = await supabase
        .from('user_profile')
        .select('bio')
        .eq('user_auth_id', testUserId)
        .single();

      expect(updatedUser.bio).toBe(specialBio);
    });
  });

  describe('Error handling', () => {
    test('should reject non-string bio values', async () => {
      let response = await request(app).put('/users/bio').send({ bio: 123 }).expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Bio must be a string');

      response = await request(app)
        .put('/users/bio')
        .send({ bio: { text: 'not a string' } })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Bio must be a string');

      response = await request(app)
        .put('/users/bio')
        .send({ bio: ['array', 'bio'] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Bio must be a string');
    });

    test('should reject null bio value', async () => {
      const response = await request(app).put('/users/bio').send({ bio: null }).expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Bio must be a string');
    });

    test('should handle missing bio field', async () => {
      const response = await request(app).put('/users/bio').send({}).expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Bio must be a string');
    });

    test('should handle authentication errors', async () => {
      const noAuthApp = express();
      noAuthApp.use(express.json());
      noAuthApp.use('/users', userEndpoints);

      const response = await request(noAuthApp).put('/users/bio').send({ bio: 'Test bio' });

      expect(response.status).toBe(500);

      if (response.body && Object.keys(response.body).length > 0) {
        expect(response.body).toHaveProperty('error');
      } else {
        expect(response.status).toBe(500);
      }
    });
  });

  describe('Database integration', () => {
    test('should preserve other user fields when updating bio', async () => {
      const newBio = 'Updated bio without affecting other fields';

      const { supabase } = require('../../../supabaseClient');
      const { data: originalUser } = await supabase
        .from('user_profile')
        .select('*')
        .eq('user_auth_id', testUserId)
        .single();

      await request(app).put('/users/bio').send({ bio: newBio }).expect(200);

      const { data: updatedUser } = await supabase
        .from('user_profile')
        .select('*')
        .eq('user_auth_id', testUserId)
        .single();

      expect(updatedUser.bio).toBe(newBio);
      expect(updatedUser.username).toBe(originalUser.username);
      expect(updatedUser.photo).toBe(originalUser.photo);
      expect(updatedUser.user_auth_id).toBe(originalUser.user_auth_id);
    });

    test('should handle multiple rapid bio updates', async () => {
      const bios = ['Bio 1', 'Bio 2', 'Bio 3', 'Final Bio'];

      for (const bio of bios) {
        await request(app).put('/users/bio').send({ bio }).expect(200);
      }

      const { supabase } = require('../../../supabaseClient');
      const { data: finalUser } = await supabase
        .from('user_profile')
        .select('bio')
        .eq('user_auth_id', testUserId)
        .single();

      expect(finalUser.bio).toBe('Final Bio');
    });
  });
});
