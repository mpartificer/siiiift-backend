const userRepository = require('../../repository/users/userRepository');
const bakeRepository = require('../../repository/bakes/bakeRepository');

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
}

module.exports = new UserService();
