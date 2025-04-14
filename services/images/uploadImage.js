const supabaseRepository = require('../../repository/images/supabaseUpload.js');

const uploadBakeImages = async (files) => {
  if (!files || files.length === 0) {
    throw new Error('No files provided');
  }

  try {
    const imageUrls = [];
    const validImageTypes = ['image/gif', 'image/jpeg', 'image/png'];

    for (const file of files) {
      const fileType = file.mimetype.toLowerCase();

      if (!validImageTypes.includes(fileType)) {
        throw new Error(`Unsupported image type: ${fileType}`);
      }

      let processedBuffer = file.buffer;
      let processedMimeType = file.mimetype;
      let processedFilename = file.originalname;

      try {
        processedBuffer = await sharp(file.buffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        processedMimeType = 'image/jpeg';
        processedFilename = file.originalname.replace(/\.[^.]+$/, '.jpg');
      } catch (error) {
        console.warn('Image optimization failed, using original file:', error.message);
      }

      const fileName = `${Date.now()}_${processedFilename}`;

      const publicUrl = await supabaseRepository.uploadFile(
        'Bake_Image',
        fileName,
        processedBuffer,
        { contentType: processedMimeType }
      );

      imageUrls.push(publicUrl);
    }

    return imageUrls;
  } catch (error) {
    console.error('Error in file service:', error);
    throw new Error(`Failed to upload images: ${error.message}`);
  }
};

module.exports = {
  uploadBakeImages,
};
