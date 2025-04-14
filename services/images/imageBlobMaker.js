const getImageAsBase64 = async (url) => {
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
};

module.exports = {
  getImageAsBase64,
};
