const { GoogleGenerativeAI } = require('@google/generative-ai');
const imageBlobMaker = require('../images/imageBlobMaker.js');

const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

const analyzeBake = async (analysisData) => {
  const {
    imageUrls,
    recipeTitle,
    hasModifications,
    originalInstructions,
    modifiedInstructions,
    originalIngredients,
    modifiedIngredients,
  } = analysisData;

  try {
    const imageAnalysisPromises = imageUrls.map(async (url) => {
      const imageData = await imageBlobMaker.getImageAsBase64(url);

      const prompt =
        'Analyze this baked good in detail. Assess the texture, color, shape, and overall appearance. Note any visible characteristics that might indicate potential improvements.';

      const result = await model.generateContent({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageData,
                },
              },
            ],
          },
        ],
      });

      const response = await result.response;
      return response.text();
    });

    const imageAnalyses = await Promise.all(imageAnalysisPromises);

    let recipePrompt;

    if (hasModifications && originalInstructions.length > 0 && originalIngredients.length > 0) {
      recipePrompt = `Analyze this bake of "${recipeTitle}" with the following modifications:
        
        Original Ingredients: ${JSON.stringify(originalIngredients)}
        Modified Ingredients: ${JSON.stringify(modifiedIngredients)}
        
        Original Instructions: ${JSON.stringify(originalInstructions)}
        Modified Instructions: ${JSON.stringify(modifiedInstructions)}
        
        Evaluate how these modifications might have affected the final result and what improvements could be made.`;
    } else {
      recipePrompt = `Analyze this bake of "${recipeTitle}".
        No modifications were made to the original recipe.
        Based on the visual analysis, what techniques could be improved and what modifications might enhance the result?`;
    }

    const recipeResult = await model.generateContent(recipePrompt);
    const recipeResponse = await recipeResult.response;
    const recipeInsights = recipeResponse.text();

    const imageInsights = imageAnalyses.join('\n');

    const finalPrompt = `You are providing feedback on a user's bake of "${recipeTitle}". 
      Based on my analysis of the provided image(s) and ${hasModifications ? 'the recipe modifications they made' : 'the original recipe execution'}:

      Image Analysis I Just Performed:
      ${imageInsights}

      Recipe Analysis I Just Performed:
      ${recipeInsights}

      Now, synthesize a helpful response to the user. Start with a brief comment about what you see in their bake photos.
      Then provide clear, specific, and actionable insights for their next attempt. Include:
      1. Technique improvements based on what you observe in their photos
      2. ${hasModifications ? 'Suggestions to refine their modifications' : 'Potential beneficial modifications they could try'}
      3. Specific tips for achieving better results

      Keep the response friendly and constructive. Avoid referring to any "analysis" - instead, directly reference what you see in their photos.
      Focus on giving them practical advice for their next bake.`;

    const finalResult = await model.generateContent(finalPrompt);
    const finalResponse = await finalResult.response;

    return finalResponse.text();
  } catch (error) {
    console.error('Error in bake analysis service:', error);
    throw new Error(`Failed to analyze bake: ${error.message}`);
  }
};

module.exports = {
  analyzeBake,
};
