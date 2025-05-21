const fs = require('fs').promises;

class ImageService {
  async getImageAsBase64(url) {
    try {
      const imageResponse = await fetch(url);

      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
      }

      const imageBlob = await imageResponse.blob();

      const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result.toString().split(',')[1];
          resolve(base64String);
        };
        reader.readAsDataURL(imageBlob);
      });

      return base64Data;
    } catch (error) {
      console.error('Error in image repository:', error);
      throw new Error(`Failed to process image: ${error.message}`);
    }
  }

  async jpegToBlob(file) {
    try {
      if (!file || !file.buffer) {
        throw new Error('Input must contain a buffer property with image data');
      }

      let imageBuffer;
      if (Buffer.isBuffer(file.buffer)) {
        imageBuffer = file.buffer;
      } else if (file.buffer instanceof ArrayBuffer || file.buffer instanceof Uint8Array) {
        imageBuffer = Buffer.from(file.buffer);
      } else {
        throw new Error('Buffer must be a Buffer, Uint8Array, or ArrayBuffer containing JPEG data');
      }

      const base64Data = imageBuffer.toString('base64');

      return base64Data;
    } catch (error) {
      console.error('Error converting JPEG to Blob:', error);
      throw error;
    }
  }
}

module.exports = new ImageService();
