const userRepository = require('../../repository/users/userRepository');
const bakeRepository = require('../../repository/bakes/bakeRepository');
const supabaseRepository = require('../../repository/images/supabaseUpload.js');

class UserService {
  async getFollowers(userId) {
    try {
      return await userRepository.getFollowers(userId);
    } catch (error) {
      console.error('Error in getFollowers service:', error);
      throw new Error(`Failed to fetch followers: ${error.message}`);
    }
  }

  async getFollowing(userId) {
    try {
      return await userRepository.getFollowing(userId);
    } catch (error) {
      console.error('Error in getFollowing service:', error);
      throw new Error(`Failed to fetch following: ${error.message}`);
    }
  }

  async updateUserProfile(userId, profileData) {
    try {
      const validFields = ['username', 'bio', 'photo'];
      const filteredData = Object.keys(profileData)
        .filter((key) => validFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = profileData[key];
          return obj;
        }, {});

      if (Object.keys(filteredData).length === 0) {
        throw new Error('No valid profile fields to update');
      }

      const updatedProfile = await userRepository.updateUserProfile(userId, filteredData);
      return updatedProfile;
    } catch (error) {
      console.error('Error in updateUserProfile service:', error);
      throw new Error(`Failed to update user profile: ${error.message}`);
    }
  }

  async getUserProfile(userId) {
    try {
      const userProfile = await userRepository.getUserProfile(userId);

      const followers = await userRepository.getFollowers(userId);
      const following = await userRepository.getFollowing(userId);

      const bakes = await bakeRepository.getUserBakes(userId);

      return {
        ...userProfile,
        followerCount: followers.length,
        followingCount: following.length,
        bakesCount: bakes.length,
      };
    } catch (error) {
      console.error('Error in getUserProfile service:', error);
      throw new Error(`Failed to fetch user profile with counts: ${error.message}`);
    }
  }

  async followUser(followerId, userId) {
    try {
      const isFollowing = await userRepository.checkFollowing(followerId, userId);
      if (isFollowing) {
        throw new Error('Already following this user');
      }

      return await userRepository.followUser(followerId, userId);
    } catch (error) {
      console.error('Error in followUser service:', error);
      throw new Error(`Failed to follow user: ${error.message}`);
    }
  }

  async unfollowUser(followerId, userId) {
    try {
      return await userRepository.unfollowUser(followerId, userId);
    } catch (error) {
      console.error('Error in unfollowUser service:', error);
      throw new Error(`Failed to unfollow user: ${error.message}`);
    }
  }

  async searchUsers(searchTerm) {
    try {
      console.log(`Searching for users with term: ${searchTerm}`);
      const users = await userRepository.searchUsers(searchTerm);

      const formattedUsers = users.map((user) => ({
        id: user.user_auth_id,
        userId: user.user_auth_id,
        username: user.username,
        photo: user.photo,
        type: 'user',
      }));

      console.log(`Found ${formattedUsers.length} users matching '${searchTerm}'`);
      return formattedUsers;
    } catch (error) {
      console.error('Error in searchUsers service:', error);
      throw new Error(`Failed to search users: ${error.message}`);
    }
  }
}

module.exports = new UserService();
