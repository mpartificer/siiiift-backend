const bakeRepository = require('../../repository/bakes/bakeRepository');
const engagementRepository = require('../../repository/engagement/engagementRepository');
const modificationRepository = require('../../repository/bakes/modificationRepository');
const userRepository = require('../../repository/users/userRepository');
const { supabase } = require('../../supabaseClient');

class BakeService {
  async getBakeHistory(username, recipeId, currentUserAuthId) {
    try {
      console.log(
        `Getting bake history for ${username}, recipe ${recipeId}, current user auth ID ${currentUserAuthId || 'guest'}`
      );

      const userData = await userRepository.getUserByUsername(username);

      if (!userData || !userData.user_auth_id) {
        throw new Error(`No user found for username: ${username}`);
      }

      const [bakeDetails, likeDetails, modificationDetails] = await Promise.all([
        bakeRepository.getBakesByUserAndRecipe(userData.user_auth_id, recipeId),
        engagementRepository.getLikesByRecipe(recipeId),
        modificationRepository.getModificationsByRecipeAndUser(recipeId, userData.user_auth_id),
      ]);

      let currentUserData = null;
      if (currentUserAuthId) {
        try {
          currentUserData = await userRepository.getUserById(currentUserAuthId);
          console.log(`Found current user data for ${currentUserAuthId}: ${!!currentUserData}`);
        } catch (e) {
          console.error(`Error fetching current user data: ${e.message}`);
        }
      }

      const currentUserDetails = {
        data: {
          user: currentUserData
            ? {
                user_auth_id: currentUserData.user_auth_id,
                id: currentUserData.user_auth_id,
                username: currentUserData.username,
                ...currentUserData,
              }
            : null,
        },
      };

      console.log(`Current user details:`, {
        hasUser: !!currentUserDetails.data.user,
        userAuthId: currentUserDetails.data.user?.user_auth_id || 'none',
      });

      return {
        profileData: userData,
        bakeDetails,
        likeDetails,
        modificationDetails,
        currentUserDetails,
      };
    } catch (error) {
      console.error('Error in getBakeHistory:', error);
      throw error;
    }
  }

  async getHomeFeed(currentUserAuthId) {
    try {
      console.log(`Getting home feed for user auth ID ${currentUserAuthId || 'guest'}`);

      const { data, error } = await supabase
        .from('bake_details_view')
        .select('*')
        .order('baked_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        return { bakeDetails: [] };
      }

      return {
        bakeDetails: data,
        currentUserId: currentUserAuthId,
      };
    } catch (error) {
      console.error('Error in getHomeFeed:', error);
      throw error;
    }
  }

  async getUsersBakes(userId) {
    try {
      const usersBakes = await bakeRepository.getUsersBakes(userId);

      return usersBakes;
    } catch (error) {
      console.error('Error retrieving User Bakes');
    }
  }
}

module.exports = new BakeService();
