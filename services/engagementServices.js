const likeRepository = require('../repository/engagement/engagementRepository');

class EngagementService {
  async toggleLike(userId, bakeId, recipeId) {
    try {
      console.log(`Toggling like for user ${userId}, bake ${bakeId}, recipe ${recipeId}`);

      const isLiked = await likeRepository.checkUserLike(userId, bakeId);
      console.log(`Current like status: ${isLiked}`);

      if (isLiked) {
        console.log(`Removing like for user ${userId}, bake ${bakeId}`);
        await likeRepository.removeLike(userId, bakeId);

        const likeCount = await this.getLikeCount(bakeId);
        console.log(`New like count after removing: ${likeCount}`);

        return {
          isLiked: false,
          likeCount,
        };
      } else {
        console.log(`Adding like for user ${userId}, bake ${bakeId}, recipe ${recipeId}`);
        await likeRepository.addLike(userId, bakeId, recipeId);

        const likeCount = await this.getLikeCount(bakeId);
        console.log(`New like count after adding: ${likeCount}`);

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
      console.log(`Getting like count for bake ${bakeId}`);
      const likes = await likeRepository.getLikesByBake(bakeId);
      console.log(`Found ${likes.length} likes for bake ${bakeId}`);
      return likes.length;
    } catch (error) {
      console.error(`Error getting like count:`, error);
      throw error;
    }
  }

  async checkUserLike(userId, bakeId) {
    try {
      console.log(`Checking if user ${userId} has liked bake ${bakeId}`);
      const isLiked = await likeRepository.checkUserLike(userId, bakeId);
      console.log(`User ${userId} has liked bake ${bakeId}: ${isLiked}`);
      return isLiked;
    } catch (error) {
      console.error(`Error checking user like:`, error);
      throw error;
    }
  }
}

module.exports = new EngagementService();
