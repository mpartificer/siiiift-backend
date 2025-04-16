const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const uploadFile = async (bucket, fileName, fileBuffer, options = {}) => {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, fileBuffer, options);

    if (error) {
      console.error('Supabase storage upload error:', error);
      throw new Error(`Storage error: ${error.message}`);
    }

    const { data: urlData, error: urlError } = supabase.storage.from(bucket).getPublicUrl(fileName);

    if (urlError) {
      throw new Error(`Failed to get public URL: ${urlError.message}`);
    }

    return urlData.publicUrl;
  } catch (error) {
    throw error;
  }
};

const uploadProfilePhoto = async (userId, fileBuffer, fileExt, contentType) => {
  try {
    const fileName = `profiles/${userId}-${Date.now()}.${fileExt}`;

    const { data, error: uploadError } = await supabase.storage
      .from('Bake_Image')
      .upload(fileName, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData, error: urlError } = supabase.storage
      .from('Bake_Image')
      .getPublicUrl(fileName);

    if (urlError) {
      throw new Error(`Failed to get public URL: ${urlError.message}`);
    }

    return urlData.publicUrl;
  } catch (error) {
    console.error('Profile picture upload error:', error);
    throw error;
  }
};

module.exports = {
  uploadFile,
  uploadProfilePhoto,
  supabase,
};
