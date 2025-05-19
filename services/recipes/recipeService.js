const recipeRepository = require('../../repository/recipes/recipeRepository');
const userRepository = require('../../repository/users/userRepository');
const { createWorker } = require('tesseract.js');
const sharp = require('sharp');

class RecipeService {
  async analyzeRecipeImages(images) {
    console.log(`Analyzing ${images.length} recipe images`);

    let combinedText = '';

    console.log('Tesseract.js Debug:');
    console.log('- createWorker type:', typeof createWorker);

    if (images.length > 0) {
      console.log('- Image info:');
      console.log('  - mimetype:', images[0].mimetype);
      console.log('  - buffer type:', typeof images[0].buffer);
      console.log('  - buffer is Buffer:', Buffer.isBuffer(images[0].buffer));
      console.log('  - buffer length:', images[0].buffer.length);
    }

    try {
      console.log('- Creating Tesseract worker...');

      const worker = await createWorker('eng');

      await worker.setParameters({
        tessedit_pageseg_mode: '3',
        preserve_interword_spaces: '1',
        textord_tabfind_find_tables: '1',
        textord_use_cjk_fp_model: '1',
        tessedit_ocr_engine_mode: '2',
        tessedit_char_whitelist:
          'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;:()[]{}!?@#$%^&*+-=_"\'/\\<>°½⅓⅔¼¾|ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ ',
        tessdata_char_blacklist: '~`§',
      });

      console.log('- Worker created and parameters set successfully');

      for (const image of images) {
        console.log(`- Processing image: ${image.originalname}`);

        console.log('  - Detailed image info:');
        console.log('    - Original name:', image.originalname);
        console.log('    - MIME type:', image.mimetype);
        console.log('    - Buffer length:', image.buffer.length);

        try {
          console.log('  - Trying multiple OCR approaches...');

          const [originalBuffer, enhancedBuffer, highContrastBuffer, invertedBuffer] =
            await Promise.all([
              Promise.resolve(image.buffer),
              this.preprocessImage(image.buffer, image.mimetype),
              this.createHighContrastVersion(image.buffer),
              this.createInvertedVersion(image.buffer),
            ]);

          console.log('  - Running OCR on each processed version...');

          const originalResult = await worker.recognize(originalBuffer);
          let bestResult = {
            text: originalResult.text,
            confidence: this.calculateAverageConfidence(originalResult),
          };
          console.log(`  - Original image confidence: ${bestResult.confidence.toFixed(2)}%`);

          const enhancedResult = await worker.recognize(enhancedBuffer);
          const enhancedConfidence = this.calculateAverageConfidence(enhancedResult);
          console.log(`  - Enhanced image confidence: ${enhancedConfidence.toFixed(2)}%`);

          if (enhancedConfidence > bestResult.confidence) {
            bestResult = {
              text: enhancedResult.text,
              confidence: enhancedConfidence,
            };
          }

          const highContrastResult = await worker.recognize(highContrastBuffer);
          const highContrastConfidence = this.calculateAverageConfidence(highContrastResult);
          console.log(`  - High contrast image confidence: ${highContrastConfidence.toFixed(2)}%`);

          if (highContrastConfidence > bestResult.confidence) {
            bestResult = {
              text: highContrastResult.text,
              confidence: highContrastConfidence,
            };
          }

          const invertedResult = await worker.recognize(invertedBuffer);
          const invertedConfidence = this.calculateAverageConfidence(invertedResult);
          console.log(`  - Inverted image confidence: ${invertedConfidence.toFixed(2)}%`);

          if (invertedConfidence > bestResult.confidence) {
            bestResult = {
              text: invertedResult.text,
              confidence: invertedConfidence,
            };
          }

          console.log(
            `  - Selected best approach with confidence: ${bestResult.confidence.toFixed(2)}%`
          );

          const processedText = this.processColumnarText(bestResult.text);
          combinedText += processedText + '\n\n';
        } catch (recognizeError) {
          console.error('  - Recognition error:', recognizeError);
        }
      }

      console.log('- Terminating worker...');
      if (worker && typeof worker.terminate === 'function') {
        await worker.terminate();
        console.log('- Worker terminated successfully');
      } else {
        console.log('- No terminate method found on worker');
      }
    } catch (error) {
      console.error('OCR initialization error:', error);
    }

    console.log('Final OCR Text length:', combinedText.length);
    if (combinedText.length > 0) {
      console.log('OCR Text sample:', combinedText.substring(0, 200));
    } else {
      console.log('No text was extracted from OCR');
    }

    console.log('Parsing extracted text (if any)');
    const recipeData = this.parseRecipeText(combinedText);

    if (images.length > 0) {
      recipeData.defaultImage = {
        buffer: images[0].buffer.toString('base64'),
        mimetype: images[0].mimetype,
      };
    }

    recipeData.originalText = combinedText;

    return recipeData;
  }

  async analyzeRecipeImages(images) {
    console.log(`Analyzing ${images.length} recipe images`);

    let combinedText = '';

    console.log('Tesseract.js Debug:');
    console.log('- createWorker type:', typeof createWorker);

    if (images.length > 0) {
      console.log('- Image info:');
      console.log('  - mimetype:', images[0].mimetype);
      console.log('  - buffer type:', typeof images[0].buffer);
      console.log('  - buffer is Buffer:', Buffer.isBuffer(images[0].buffer));
      console.log('  - buffer length:', images[0].buffer.length);
    }

    try {
      console.log('- Creating Tesseract worker...');

      const worker = await createWorker('eng');

      await worker.setParameters({
        tessedit_pageseg_mode: '1',
        preserve_interword_spaces: '1',
        textord_tabfind_find_tables: '1',
        textord_use_cjk_fp_model: '1',
        tessedit_ocr_engine_mode: '2',
      });

      console.log('- Worker created and parameters set successfully');

      for (const image of images) {
        console.log(`- Processing image: ${image.originalname}`);

        console.log('  - Detailed image info:');
        console.log('    - Original name:', image.originalname);
        console.log('    - MIME type:', image.mimetype);
        console.log('    - Buffer length:', image.buffer.length);

        try {
          console.log('  - Preprocessing image to improve text contrast...');
          const processedImageBuffer = await this.preprocessImage(image.buffer, image.mimetype);
          console.log('  - Image preprocessing completed');

          console.log('  - Calling worker.recognize()...');

          const result = await worker.recognize(processedImageBuffer);

          console.log('  - Recognition completed successfully');
          console.log('  - Result type:', typeof result);

          if (result && typeof result === 'object') {
            if (result.text) {
              console.log('  - Text field found in result');
              console.log('  - Text length:', result.text.length);
              console.log('  - First 100 chars:', result.text.substring(0, 100));

              const processedText = this.processColumnarText(result.text);
              combinedText += processedText + '\n\n';

              if (result.data && result.data.lines) {
                console.log('  - Line confidence data available');
                this.logConfidenceData(result.data.lines);
              }
            } else if (result.data && result.data.text) {
              console.log('  - Text field found in result.data');
              console.log('  - Text length:', result.data.text.length);
              console.log('  - First 100 chars:', result.data.text.substring(0, 100));

              const processedText = this.processColumnarText(result.data.text);
              combinedText += processedText + '\n\n';
            } else {
              console.log('  - No text found in result:', Object.keys(result));
              if (result.data) {
                console.log('  - result.data keys:', Object.keys(result.data));
              }
            }
          } else {
            console.log('  - Unexpected result type:', typeof result);
          }
        } catch (recognizeError) {
          console.error('  - Recognition error:', recognizeError);
        }
      }

      console.log('- Terminating worker...');
      if (worker && typeof worker.terminate === 'function') {
        await worker.terminate();
        console.log('- Worker terminated successfully');
      } else {
        console.log('- No terminate method found on worker');
      }
    } catch (error) {
      console.error('OCR initialization error:', error);
    }

    console.log('Final OCR Text length:', combinedText.length);
    if (combinedText.length > 0) {
      console.log('OCR Text sample:', combinedText.substring(0, 200));
    } else {
      console.log('No text was extracted from OCR');
    }

    console.log('Parsing extracted text (if any)');
    const recipeData = this.parseRecipeText(combinedText);

    if (images.length > 0) {
      recipeData.defaultImage = {
        buffer: images[0].buffer.toString('base64'),
        mimetype: images[0].mimetype,
      };
    }

    recipeData.originalText = combinedText;

    return recipeData;
  }

  async preprocessImage(imageBuffer, mimeType) {
    console.log('Starting image preprocessing');

    try {
      let sharpImage = sharp(imageBuffer);

      const metadata = await sharpImage.metadata();
      console.log(
        `  - Image size: ${metadata.width}x${metadata.height}, format: ${metadata.format}`
      );

      if (!['jpeg', 'png', 'webp', 'tiff'].includes(metadata.format)) {
        console.log(`  - Converting from ${metadata.format} to png for better processing`);
        sharpImage = sharpImage.toFormat('png');
      }

      sharpImage = sharpImage
        .grayscale()
        .normalize()
        .modulate({
          brightness: 1.05,
          saturation: 0,
          contrast: 1.4,
        })
        .sharpen({
          sigma: 1.5,
          flat: 1.0,
          jagged: 1.0,
        })
        .threshold(140)
        .median(1);

      if (metadata.width && metadata.width > 800) {
        console.log('  - Large image detected, applying additional processing for fine details');
        sharpImage = sharpImage.resize({
          width: Math.min(metadata.width, 2000),
          height: Math.min(metadata.height, 2800),
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      const processedBuffer = await sharpImage.toBuffer();
      console.log(
        `  - Image preprocessing complete. Original size: ${imageBuffer.length}, new size: ${processedBuffer.length}`
      );

      return processedBuffer;
    } catch (error) {
      console.error('Error during image preprocessing:', error);
      console.log('  - Using original image due to preprocessing error');
      return imageBuffer;
    }
  }

  logConfidenceData(lines) {
    if (!lines || !Array.isArray(lines)) return;

    const lowConfidenceLines = lines
      .filter((line) => line.confidence < 70)
      .map((line) => ({
        text: line.text.substring(0, 30) + (line.text.length > 30 ? '...' : ''),
        confidence: line.confidence,
      }));

    if (lowConfidenceLines.length > 0) {
      console.log('  - Lines with low confidence:', lowConfidenceLines);
    }
  }

  processColumnarText(text) {
    const lines = text.split('\n');
    const hasColumns = this.detectColumns(lines);

    if (!hasColumns) {
      return text;
    }

    const processedText = this.mergeColumns(lines);

    return processedText.replace(/INGREDIENT:\s*/g, '');
  }

  detectColumns(lines) {
    if (lines.length < 8) return false;

    let gapCounts = 0;
    let shortLinesCount = 0;
    let ingredientPatternCount = 0;

    for (const line of lines) {
      if (/\S+\s{3,}\S+/.test(line)) {
        gapCounts++;
      }

      if (line.trim().length > 0 && line.trim().length < 20) {
        shortLinesCount++;
      }

      if (this.isLikelyIngredientLine(line)) {
        ingredientPatternCount++;
      }
    }

    const gapRatio = gapCounts / lines.length;
    const shortLineRatio = shortLinesCount / lines.length;
    const ingredientRatio = ingredientPatternCount / lines.length;

    return gapRatio > 0.25 || shortLineRatio > 0.3 || ingredientRatio > 0.2;
  }

  mergeColumns(lines) {
    const lineLengths = lines.map((l) => l.length).filter((len) => len > 5);
    const maxLineLength = Math.max(...lineLengths, 0);

    if (maxLineLength < 25) return lines.join('\n');

    const midPoint = Math.floor(maxLineLength / 2);
    const leftColumn = [];
    const rightColumn = [];

    let ingredientBlockDetected = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) continue;

      if (line.length > midPoint * 1.5) {
        if (this.isLikelyIngredientLine(trimmedLine)) {
          ingredientBlockDetected = true;
        }

        if (ingredientBlockDetected && !this.isLikelyInstructionLine(trimmedLine)) {
          leftColumn.push('INGREDIENT: ' + trimmedLine);
        } else {
          leftColumn.push(trimmedLine);
        }
      } else {
        const leftHalf = line.substring(0, midPoint).trim();
        const rightHalf = line.substring(midPoint).trim();

        if (leftHalf && !rightHalf) {
          if (this.isLikelyIngredientLine(leftHalf)) {
            ingredientBlockDetected = true;
            leftColumn.push('INGREDIENT: ' + leftHalf);
          } else {
            leftColumn.push(leftHalf);
          }
        } else if (!leftHalf && rightHalf) {
          if (this.isLikelyIngredientLine(rightHalf)) {
            ingredientBlockDetected = true;
            rightColumn.push('INGREDIENT: ' + rightHalf);
          } else {
            rightColumn.push(rightHalf);
          }
        } else if (leftHalf && rightHalf) {
          if (this.isLikelyIngredientLine(leftHalf)) {
            ingredientBlockDetected = true;
            leftColumn.push('INGREDIENT: ' + leftHalf);
          } else {
            leftColumn.push(leftHalf);
          }

          if (this.isLikelyIngredientLine(rightHalf)) {
            ingredientBlockDetected = true;
            rightColumn.push('INGREDIENT: ' + rightHalf);
          } else {
            rightColumn.push(rightHalf);
          }
        }
      }
    }

    let processedText = leftColumn.join('\n') + '\n\n' + rightColumn.join('\n');
    return processedText;
  }

  async storeRecipe(userId, recipeData) {
    console.log(`Saving recipe for user ${userId}`);

    try {
      const recipeToSave = {
        title: recipeData.title || 'Untitled Recipe',
        ingredients: recipeData.ingredients,
        instructions: recipeData.instructions,
        prep_time: recipeData.prep_time,
        cook_time: recipeData.cook_time,
        total_time: recipeData.total_time,
        original_link: recipeData.original_link || 'Unknown',
      };

      const savedRecipe = await recipeRepository.createRecipe(recipeToSave);

      if (recipeData.defaultImage && recipeData.defaultImage.buffer) {
        await recipeRepository.saveRecipeImage(
          savedRecipe.id,
          recipeData.defaultImage.buffer,
          recipeData.defaultImage.mimetype
        );
      }

      console.log(`Recipe saved successfully with ID: ${savedRecipe.id}`);
      return savedRecipe;
    } catch (error) {
      console.error('Error saving recipe:', error);
      throw error;
    }
  }

  parseRecipeText(text) {
    const recipeData = {
      title: '',
      ingredients: [],
      instructions: [],
      prepTime: '',
      cookTime: '',
      totalTime: '',
      originalAuthor: '',
    };

    if (!text || text.trim().length === 0) {
      return recipeData;
    }

    const cleanedText = this.preProcessText(text);
    const lines = cleanedText.split('\n').filter((line) => line.trim());

    if (lines.length === 0) {
      return recipeData;
    }

    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim();
      const lowerLine = line.toLowerCase();

      if (
        line.length > 3 &&
        line.length < 60 &&
        !lowerLine.includes('ingredient') &&
        !lowerLine.includes('instruction') &&
        !lowerLine.match(/serves|yield|prep|cook/i) &&
        !line.match(/^\d+\s+/) &&
        !line.match(/^[-•*]/) &&
        !line.match(/\d+\s*(?:cup|tbsp|tsp|oz|g|ml|sticks)/i)
      ) {
        recipeData.title = line;
        break;
      }
    }

    let ingredientSectionIndex = -1;
    let instructionSectionIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const lowerLine = lines[i].toLowerCase().trim();

      if (
        lowerLine === 'ingredients' ||
        lowerLine === 'ingredients:' ||
        lowerLine.match(/^ingredients\s*:/i)
      ) {
        ingredientSectionIndex = i;
      }

      if (
        lowerLine === 'instructions' ||
        lowerLine === 'instructions:' ||
        lowerLine === 'directions' ||
        lowerLine === 'directions:' ||
        lowerLine.match(/^instructions\s*:/i) ||
        lowerLine.match(/^directions\s*:/i)
      ) {
        instructionSectionIndex = i;
      }

      if (lowerLine.match(/prep\s+time|preparation\s+time/i)) {
        const match = lines[i].match(/(\d+\s*(?:min|hour|minute|hr|sec|second)s?)/i);
        if (match) recipeData.prepTime = match[1];
      }

      if (lowerLine.match(/cook\s+time|bake\s+time|baking\s+time/i)) {
        const match = lines[i].match(/(\d+\s*(?:min|hour|minute|hr|sec|second)s?)/i);
        if (match) recipeData.cookTime = match[1];
      }

      if (lowerLine.includes('total time')) {
        const match = lines[i].match(/(\d+\s*(?:min|hour|minute|hr|sec|second)s?)/i);
        if (match) recipeData.totalTime = match[1];
      }
    }

    let currentSection = null;
    let inIngredientsSection = false;
    let inInstructionsSection = false;
    let ingredientBlockStarted = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const lowerLine = line.toLowerCase();

      if (i === ingredientSectionIndex || lowerLine.match(/^ingredients\s*:?$/i)) {
        currentSection = 'ingredients';
        inIngredientsSection = true;
        continue;
      }

      if (
        i === instructionSectionIndex ||
        lowerLine.match(/^instructions\s*:?$/i) ||
        lowerLine.match(/^directions\s*:?$/i)
      ) {
        currentSection = 'instructions';
        inIngredientsSection = false;
        inInstructionsSection = true;
        continue;
      }

      if (lowerLine.match(/prep\s+time|cook\s+time|total\s+time|yield/i)) {
        continue;
      }

      const isIngredientLine = this.isLikelyIngredientLine(line);
      const isInstructionLine = this.isLikelyInstructionLine(line);

      if (
        inIngredientsSection ||
        (ingredientSectionIndex === -1 && isIngredientLine && !ingredientBlockStarted)
      ) {
        if (isIngredientLine) {
          if (!ingredientBlockStarted) {
            ingredientBlockStarted = true;
          }
          recipeData.ingredients.push(this.cleanIngredientLine(line));
        } else if (ingredientBlockStarted && line.length > 40 && !isIngredientLine) {
          inIngredientsSection = false;
          inInstructionsSection = true;
          recipeData.instructions.push(this.cleanInstructionLine(line));
        }
      } else if (
        inInstructionsSection ||
        (instructionSectionIndex === -1 &&
          (isInstructionLine ||
            (i > Math.floor(lines.length / 2) && recipeData.ingredients.length > 0)))
      ) {
        recipeData.instructions.push(this.cleanInstructionLine(line));
      } else if (isIngredientLine && !ingredientBlockStarted) {
        ingredientBlockStarted = true;
        recipeData.ingredients.push(this.cleanIngredientLine(line));
      } else if (
        isInstructionLine ||
        (recipeData.ingredients.length > 0 && line.length > 30 && !isIngredientLine)
      ) {
        recipeData.instructions.push(this.cleanInstructionLine(line));
      }
    }

    if (recipeData.title === '' && lines.length > 0) {
      const potentialTitles = lines.filter((line) => {
        const lowerLine = line.toLowerCase();
        return (
          line.length > 3 &&
          line.length < 60 &&
          !lowerLine.includes('ingredient') &&
          !lowerLine.includes('instruction') &&
          !lowerLine.match(/^\d+\s+/) &&
          !lowerLine.match(/prep\s+time|cook\s+time|bake\s+time/i)
        );
      });

      if (potentialTitles.length > 0) {
        recipeData.title = potentialTitles[0];
      }
    }

    this.cleanupIngredientsList(recipeData);
    this.cleanupInstructionsList(recipeData);

    return recipeData;
  }

  cleanupIngredientsList(recipeData) {
    recipeData.ingredients = recipeData.ingredients.filter((ingredient) => {
      if (ingredient.length < 2) return false;

      const lowerIngredient = ingredient.toLowerCase();
      if (lowerIngredient.includes('preheat')) return false;
      if (lowerIngredient.includes('instructions')) return false;
      if (lowerIngredient.includes('directions')) return false;
      if (lowerIngredient.match(/^step\s+\d+/i)) return false;

      return true;
    });
  }

  cleanupInstructionsList(recipeData) {
    recipeData.instructions = recipeData.instructions.filter((instruction) => {
      if (instruction.length < 3) return false;

      const lowerInstruction = instruction.toLowerCase();
      if (
        lowerInstruction.includes('tablespoon') &&
        lowerInstruction.length < 30 &&
        !lowerInstruction.includes('add') &&
        !lowerInstruction.includes('mix')
      ) {
        recipeData.ingredients.push(instruction);
        return false;
      }

      if (
        lowerInstruction.match(/^\d+\s*(?:cup|tbsp|tsp|teaspoon|tablespoon)/i) &&
        lowerInstruction.length < 30
      ) {
        recipeData.ingredients.push(instruction);
        return false;
      }

      return true;
    });
  }

  preProcessText(text) {
    return text
      .replace(/(\d+)l(\d+)/g, '$1/$2')
      .replace(/(\d+)I(\d+)/g, '$1/2')
      .replace(/(\d+)\/(\s)/g, '$1/2$2')
      .replace(/\|\s*\n/g, '\n')
      .replace(/\s{3,}/g, ' | ')
      .replace(/(\s|^)j(\s|$)/g, '$11$2')
      .replace(/(\s|^)l(\s|$)/g, '$11$2')
      .replace(/(\s|^)z(\s|$)/g, '$12$2')
      .replace(/(\s|^)O(\s|$)/g, '$10$2')
      .replace(/(\d+)([A-Za-z])(\.)/, '$1 $2$3')
      .replace(/([Tt])(\.)(\s*)([a-z])/, '$1$2 $4')
      .replace(/sticks\s*,/gi, 'sticks, ')
      .replace(/tablespoons\s*\(/gi, 'tablespoons (')
      .replace(/butter\s*\*/gi, 'butter *')
      .replace(/\d+\s*g\)/gi, (match) => match.replace(/\s+/g, ' '));
  }

  isLikelyIngredientLine(line) {
    const ingredientPatterns = [
      /^\d+\s*(?:cup|c\.|tbsp|tbs|tsp|oz|g|kg|ml|l|pound|lb)/i,
      /\d+\s*(?:cup|c\.|tbsp|tbs|tsp|oz|g|kg|ml|l|pound|lb)/i,
      /\d+\s*(?:[¼½¾⅓⅔]|\/)/,
      /^\d+$/,
      /tablespoons|sticks|teaspoon|cup\s+\(|g\)|cup\s+\(/i,
      /flour|sugar|butter|oil|salt|pepper|egg|milk|cream|water|vanilla|cinnamon|chocolate/i,
      /^[-•*]/,
      /^\s*\*/,
      /^\s*[\d\.]+\s+\w+/,
      /\(\d+[a-z]*\)/i,
      /\(\d+\s*[a-z]+\)/i,
    ];

    return ingredientPatterns.some((pattern) => pattern.test(line));
  }

  cleanIngredientLine(line) {
    return line
      .replace(/([0-9])l([0-9])/g, '$1/$2')
      .replace(/([^\d])l([^\d])/g, '$1/$2')
      .replace(/(\d+)([cC])\./, '$1 $2.')
      .replace(/(\d+)([tT])\./, '$1 $2.')
      .replace(/\s*\|\s*/, ' ')
      .trim();
  }

  isLikelyInstructionLine(line) {
    const instructionPatterns = [
      /^\d+\./,
      /^\d+\)/,
      /^\d+\s*[:-]/,
      /^Step/,
      /^[-•*]/,
      /^[A-Z][a-z]+\s+(and|the|to|in|on)\s/,
      /preheat|heat|mix|stir|beat|add|combine|place|pour|bake|cook/i,
      /remove|cool|serve|let|allow|spread|transfer|fold|whisk/i,
    ];

    return instructionPatterns.some((pattern) => pattern.test(line)) || line.length > 40;
  }

  cleanInstructionLine(lines) {
    console.log(`Found ${lines.length} lines of text to parse`);

    if (lines.length > 0) {
      const potentialTitles = lines.filter((line) => {
        return (
          (line === line.toUpperCase() ||
            line
              .split(' ')
              .map((word) => word.charAt(0))
              .join('') ===
              line
                .split(' ')
                .map((word) => word.charAt(0))
                .join('')
                .toUpperCase()) &&
          line.length > 3 &&
          line.length < 50 &&
          !line.match(/^[0-9]+/)
        );
      });

      if (potentialTitles.length > 0) {
        recipeData.title = potentialTitles[0].trim();
      } else {
        const firstNonSectionLine = lines.find((line) => {
          const lowercaseLine = line.toLowerCase();
          return (
            !lowercaseLine.includes('ingredient') &&
            !lowercaseLine.includes('instruction') &&
            !lowercaseLine.includes('direction') &&
            line.length > 3 &&
            line.length < 50
          );
        });

        recipeData.title = firstNonSectionLine || lines[0].trim();
      }
    }

    let currentSection = null;
    let indentationLevels = {};

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const lowerLine = line.toLowerCase();
      const leadingSpaces = lines[i].search(/\S|$/);

      if (leadingSpaces > 0) {
        indentationLevels[leadingSpaces] = (indentationLevels[leadingSpaces] || 0) + 1;
      }

      if (
        lowerLine.includes('ingredient') ||
        lowerLine.includes('you need') ||
        lowerLine.match(/^\s*ingredients\s*$/i)
      ) {
        currentSection = 'ingredients';
        continue;
      } else if (
        lowerLine.includes('instruction') ||
        lowerLine.includes('direction') ||
        lowerLine.includes('method') ||
        lowerLine.includes('preparation') ||
        lowerLine.match(/^\s*instructions\s*$/i) ||
        lowerLine.match(/^\s*directions\s*$/i)
      ) {
        currentSection = 'instructions';
        continue;
      }

      if (lowerLine.includes('prep time') || lowerLine.includes('preparation time')) {
        const match = line.match(/(\d+\s*(?:min|hour|minute|hr|sec|second)s?)/i);
        if (match) recipeData.prepTime = match[1];
        continue;
      }

      if (lowerLine.includes('cook time') || lowerLine.includes('bake time')) {
        const match = line.match(/(\d+\s*(?:min|hour|minute|hr|sec|second)s?)/i);
        if (match) recipeData.cookTime = match[1];
        continue;
      }

      if (lowerLine.includes('total time')) {
        const match = line.match(/(\d+\s*(?:min|hour|minute|hr|sec|second)s?)/i);
        if (match) recipeData.totalTime = match[1];
        continue;
      }

      if ((line.includes('—') || line.includes('-')) && line.length < 50) {
        recipeData.originalAuthor = line;
        continue;
      }

      if (
        currentSection === 'ingredients' ||
        (!currentSection && this.isLikelyIngredientLine(line))
      ) {
        recipeData.ingredients.push(this.cleanIngredientLine(line));
        if (!currentSection) currentSection = 'ingredients';
      } else if (
        currentSection === 'instructions' ||
        (!currentSection && this.isLikelyInstructionLine(line))
      ) {
        recipeData.instructions.push(this.cleanInstructionLine(line));
        if (!currentSection) currentSection = 'instructions';
      } else if (currentSection === 'ingredients' && line.length > 40) {
        recipeData.instructions.push(this.cleanInstructionLine(line));
        currentSection = 'instructions';
      } else {
        if (
          line.match(/\d+\s*(cup|tbsp|tsp|oz|g|ml|pound|lb)/i) ||
          line.match(/^\s*-\s+/) ||
          line.match(/^\s*•\s+/) ||
          line.match(/^\s*\*\s+/) ||
          line.match(/^\s*[\d\.]+\s+\w+/)
        ) {
          recipeData.ingredients.push(this.cleanIngredientLine(line));
        } else if (
          line.length > 40 ||
          line.match(/^\s*\d+[\.\)]\s+/) ||
          line.match(/^\s*step\s+\d+/i)
        ) {
          recipeData.instructions.push(this.cleanInstructionLine(line));
        }
      }
    }

    console.log('Indentation levels detected:', indentationLevels);

    console.log('Parsing results:');
    console.log(`- Title: ${recipeData.title}`);
    console.log(`- Ingredients: ${recipeData.ingredients.length}`);
    console.log(`- Instructions: ${recipeData.instructions.length}`);
    console.log(`- Author: ${recipeData.originalAuthor}`);

    return recipeData;
  }

  preProcessText(text) {
    return text
      .replace(/(\d+)l(\d+)/g, '$1/$2')
      .replace(/(\d+)I(\d+)/g, '$1/2')
      .replace(/(\d+)\/(\s)/g, '$1/2$2')

      .replace(/\|\s*\n/g, '\n')
      .replace(/\s{3,}/g, ' | ')

      .replace(/(\s|^)j(\s|$)/g, '$11$2')
      .replace(/(\s|^)l(\s|$)/g, '$11$2')
      .replace(/(\s|^)z(\s|$)/g, '$12$2')
      .replace(/(\s|^)O(\s|$)/g, '$10$2')

      .replace(/(\d+)([A-Za-z])(\.)/, '$1 $2$3')
      .replace(/([Tt])(\.)(\s*)([a-z])/, '$1$2 $4');
  }

  isLikelyIngredientLine(line) {
    return (
      /^[-•*]|\d+\s*(?:cup|c\.|tbsp|tbs|tsp|oz|g|kg|ml|l|pound|lb)|^\d+\s*(?:[¼½¾⅓⅔]|\/)|^\d+$/.test(
        line
      ) || /^\s*[-•*]|\s{3,}\d+\s*(?:cup|tbsp|tsp|oz|g|ml)/.test(line)
    );
  }

  cleanIngredientLine(line) {
    return line
      .replace(/([0-9])l([0-9])/g, '$1/$2')
      .replace(/([^\d])l([^\d])/g, '$1/$2')
      .replace(/(\d+)([cC])\./, '$1 $2.')
      .replace(/(\d+)([tT])\./, '$1 $2.')
      .replace(/\s*\|\s*/, ' ')
      .trim();
  }

  isLikelyInstructionLine(line) {
    return (
      /^\d+\.|\d+\)|\d+\s*[:-]|^Step|^[-•*]|^[A-Z][a-z]+\s+(and|the|to|in|on)\s/.test(line) ||
      line.length > 40 ||
      /\s{3,}\d+\.|\s{3,}step\s+\d+/i.test(line)
    );
  }

  cleanInstructionLine(line) {
    return line
      .replace(/([.,:;]) ([a-z])/g, '$1 $2')
      .replace(/0il/g, 'oil')
      .replace(/\s*\|\s*/, ' ')
      .trim();
  }

  async getRecipeDetails(recipeId) {
    try {
      console.log(`Getting recipe details for recipe ${recipeId}`);
      const recipeDetails = await recipeRepository.getRecipeById(recipeId);
      console.log(`Retrieved recipe details for ${recipeId}`);
      return recipeDetails;
    } catch (error) {
      console.error(`Error getting recipe details:`, error);
      throw error;
    }
  }

  async getRecipeRatings(recipeId) {
    try {
      console.log(`Getting ratings for recipe ${recipeId}`);
      const ratings = await recipeRepository.getRecipeRatings(recipeId);
      console.log(`Retrieved ratings for recipe ${recipeId}`);
      return ratings;
    } catch (error) {
      console.error(`Error getting recipe ratings:`, error);
      throw error;
    }
  }

  async getRecipeBox(userId) {
    const userDetails = await userRepository.getUserById(userId);
    const savedRecipes = await recipeRepository.getSavesByUserId(userId);

    return {
      ...userDetails,
      savedRecipes,
    };
  }

  async getSavesByUserId(userId) {
    try {
      console.log(`Getting saves by user ${userId}`);
      const savedRecipes = await recipeRepository.getSavesByUserId(userId);
      console.log(`Retrieved saves for user ${userId}`);
      return savedRecipes;
    } catch (error) {
      console.error(`Error getting recipe saves:`, error);
      throw error;
    }
  }

  async getRecipeDropdownData(userId) {
    try {
      console.log(`Getting recipe dropdown data for user ${userId}`);
      const savedRecipes = await recipeRepository.getSavesByUserId(userId);

      const formattedRecipes = savedRecipes.map((recipe) => ({
        recipe_id: recipe.recipe_id,
        recipe_title: recipe.recipe_title,
      }));

      console.log(`Retrieved ${formattedRecipes.length} recipes for dropdown`);
      return formattedRecipes;
    } catch (error) {
      console.error(`Error getting recipe dropdown data:`, error);
      throw error;
    }
  }

  async getRecipeStats(recipeId) {
    try {
      console.log(`Getting stats for recipe ${recipeId}`);

      const [likesResponse, savesResponse, bakesResponse] = await Promise.all([
        recipeRepository.getLikesByRecipeId(recipeId),
        recipeRepository.getSavesByRecipeId(recipeId),
        recipeRepository.getBakesByRecipeId(recipeId),
      ]);

      console.log(`Retrieved stats for recipe ${recipeId}`);

      return {
        likesCount: likesResponse.count || 0,
        savesCount: savesResponse.count || 0,
        bakesCount: bakesResponse.count || 0,
      };
    } catch (error) {
      console.error(`Error getting recipe stats:`, error);
      throw error;
    }
  }

  async getBakesList(recipeId) {
    try {
      console.log(`Getting bakes list for recipe ${recipeId}`);
      const bakes = await recipeRepository.getBakeDetailsView(recipeId);
      console.log(`Retrieved ${bakes.length} bakes for recipe ${recipeId}`);
      return bakes;
    } catch (error) {
      console.error(`Error getting bakes list:`, error);
      throw error;
    }
  }

  async toggleSave(userId, recipeId) {
    try {
      console.log(`Toggling save for user ${userId}, recipe ${recipeId}`);

      const isSaved = await recipeRepository.checkUserSave(userId, recipeId);
      console.log(`Current save status: ${isSaved}`);

      if (isSaved) {
        console.log(`Removing save for user ${userId}, recipe ${recipeId}`);
        await recipeRepository.removeSave(userId, recipeId);

        const { count: saveCount } = await recipeRepository.getSavesByRecipeId(recipeId);
        console.log(`New save count after removing: ${saveCount}`);

        return {
          isSaved: false,
          saveCount,
        };
      } else {
        console.log(`Adding save for user ${userId}, recipe ${recipeId}`);
        await recipeRepository.addSave(userId, recipeId);

        const { count: saveCount } = await recipeRepository.getSavesByRecipeId(recipeId);
        console.log(`New save count after adding: ${saveCount}`);

        return {
          isSaved: true,
          saveCount,
        };
      }
    } catch (error) {
      console.error(`Error toggling save:`, error);
      throw error;
    }
  }

  async checkUserSave(userId, recipeId) {
    try {
      console.log(`Checking if user ${userId} has saved recipe ${recipeId}`);
      const isSaved = await recipeRepository.checkUserSave(userId, recipeId);
      console.log(`User ${userId} has saved recipe ${recipeId}: ${isSaved}`);
      return isSaved;
    } catch (error) {
      console.error(`Error checking user save:`, error);
      throw error;
    }
  }

  async searchRecipes(searchTerm) {
    try {
      console.log(`Searching for recipes with term: ${searchTerm}`);
      const recipes = await recipeRepository.searchRecipes(searchTerm);

      const formattedRecipes = recipes.map((recipe) => ({
        id: recipe.id,
        recipeId: recipe.id,
        title: recipe.title,
        images: recipe.images,
        type: 'recipe',
      }));

      console.log(`Found ${formattedRecipes.length} recipes matching '${searchTerm}'`);
      return formattedRecipes;
    } catch (error) {
      console.error(`Error searching recipes:`, error);
      throw new Error(`Failed to search recipes: ${error.message}`);
    }
  }
}

module.exports = new RecipeService();
