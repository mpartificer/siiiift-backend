const likeRepository = require('../repository/engagement/engagementRepository');
const userRepository = require('../repository/users/userRepository');
const recipeRepository = require('../repository/recipes/recipeRepository');

class EngagementService {
  async toggleLike(userId, bakeId, recipeId) {
    try {
      const isLiked = await likeRepository.checkUserLike(userId, bakeId);

      if (isLiked) {
        await likeRepository.removeLike(userId, bakeId);

        const likeCount = await this.getLikeCount(bakeId);

        return {
          isLiked: false,
          likeCount,
        };
      } else {
        await likeRepository.addLike(userId, bakeId, recipeId);

        const likeCount = await this.getLikeCount(bakeId);

        return {
          isLiked: true,
          likeCount,
        };
      }
    } catch (error) {
      console.error(`Error toggling like:`, error);
      throw error;
    }
  }

  async getLikeCount(bakeId) {
    try {
      const likes = await likeRepository.getLikesByBake(bakeId);
      return likes.length;
    } catch (error) {
      console.error(`Error getting like count:`, error);
      throw error;
    }
  }

  async checkUserLike(userId, bakeId) {
    try {
      const isLiked = await likeRepository.checkUserLike(userId, bakeId);
      return isLiked;
    } catch (error) {
      console.error(`Error checking user like:`, error);
      throw error;
    }
  }
}

module.exports = new EngagementService();
