const BakeService = require('../../../services/bakes/bakeService');

describe('BakeService', () => {
  describe('getFinalPrompt', () => {
    it('should return the final prompt which we are going to send to Gemini for analysis', async () => {
      const recipeTitle = 'Chocolate Cake';
      const hasModifications = true;
      const imageInsights = 'Image analysis results';
      const recipeInsights = 'Recipe analysis results';

      const result = await BakeService.getFinalPrompt(
        recipeTitle,
        hasModifications,
        imageInsights,
        recipeInsights
      );

      expect(result).toBe(`You are providing feedback on a user's bake of "Chocolate Cake". 
    Based on my analysis of the provided image(s) and the recipe modifications they made:

    Image Analysis I Just Performed:
    Image analysis results

    Recipe Analysis I Just Performed:
    Recipe analysis results

    Now, synthesize a helpful response to the user. Start with a brief comment about what you see in their bake photos.
    Then provide clear, specific, and actionable insights for their next attempt. Include:
    1. Technique improvements based on what you observe in their photos
    2. Suggestions to refine their modifications
    3. Specific tips for achieving better results

    Keep the response friendly and constructive. Avoid referring to any "analysis" - instead, directly reference what you see in their photos.
    Focus on giving them practical advice for their next bake.`);
    });
  });
});
