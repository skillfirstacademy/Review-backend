import pool from '../config/db.js';
import  { randomUUID }  from 'crypto';

export const addReply = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { userId, text } = req.body;

    if (!userId || !text) {
      return res.status(400).json({ error: 'User ID and text are required' });
    }

    // Fetch user details
    const userRes = await pool.query(
      'SELECT first_name, last_name, profile_picture FROM users WHERE id = $1',
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];
    const displayName = `${user.first_name} ${user.last_name}`.trim();

    // Check if parent review exists and get company_id
    const parentReview = await pool.query(
      'SELECT company_id, source FROM reviews WHERE id = $1',
      [reviewId]
    );

    if (parentReview.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const { company_id: companyId, source } = parentReview.rows[0];

    // Insert reply
    const result = await pool.query(
      'INSERT INTO reviews (parent_id, user_id, text, company_id, source) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [reviewId, userId, text, companyId, 'internal']
    );

    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Failed to add reply' });
    }

    // Emit Socket.io event for real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`company-${companyId}`).emit('reply-added', {
        reviewId,
        companyId,
        reply: {
          ...result.rows[0],
          displayName,
          profile_picture: user.profile_picture,
        }
      });
    }

    return res.status(201).json({
      ...result.rows[0],
      displayName,
      profile_picture: user.profile_picture,
    });

  } catch (err) {
    console.error('Error adding reply:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      details: err.message 
    });
  }
};

export const deleteReply = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reviewId) || !uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid review ID or user ID' });
    }

    // Verify user exists
    const userCheck = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify the review is a reply and owned by the user
    const reviewCheck = await pool.query(
      'SELECT parent_id, user_id FROM reviews WHERE id = $1',
      [reviewId]
    );
    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    const review = reviewCheck.rows[0];
    if (review.parent_id === null) {
      return res.status(400).json({ error: 'This is not a reply' });
    }
    if (review.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to delete this reply' });
    }

    const result = await pool.query(
      'DELETE FROM reviews WHERE id = $1 RETURNING *',
      [reviewId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    res.status(200).json({ message: 'Reply deleted successfully' });
  } catch (err) {
    console.error('Error deleting reply:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const likeReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reviewId) || !uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid review ID or user ID' });
    }

    // Verify user exists
    const userCheck = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify review exists
    const reviewCheck = await pool.query('SELECT 1 FROM reviews WHERE id = $1', [reviewId]);
    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Check if user already liked the review
    const likeCheck = await pool.query(
      'SELECT 1 FROM reviewLikes WHERE review_id = $1 AND user_id = $2',
      [reviewId, userId]
    );
    if (likeCheck.rows.length > 0) {
      return res.status(409).json({ error: 'You have already liked this review' });
    }

    // Insert like
    const result = await pool.query(
      'INSERT INTO reviewLikes (review_id, user_id) VALUES ($1, $2) RETURNING *',
      [reviewId, userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You have already liked this review' });
    }
    console.error('Error liking review:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const unlikeReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reviewId) || !uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid review ID or user ID' });
    }

    // Verify user exists
    const userCheck = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      'DELETE FROM reviewLikes WHERE review_id = $1 AND user_id = $2 RETURNING *',
      [reviewId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Like not found' });
    }

    res.status(200).json({ message: 'Like removed' });
  } catch (err) {
    console.error('Error unliking review:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getReviewsForCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    // 🏢 Fetch company info
    const companyResult = await pool.query(
      'SELECT id, name, comp_profile_img FROM companies WHERE id = $1',
      [companyId]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];

    // 📊 Fetch all reviews (both internal and Google) with replies
    const reviewsQuery = `
      SELECT 
        r.id,
        r.company_id,
        r.user_id,
        r.text,
        r.rating,
        r.created_at,
        r.source,
        
        -- Google review specific fields
        r.google_review_id,
        r.author_name,
        r.author_photo_url,
        r.author_profile_url,
        r.publish_time,
        r.google_maps_uri,
        r.language_code,
        
        -- Internal review user fields
        u.first_name,
        u.last_name,
        u.profile_picture,
        
        -- Aggregate replies as JSON array
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'id', reply.id,
              'text', reply.text,
              'userId', reply.user_id,
              'createdAt', reply.created_at,
              'displayName', CONCAT(reply_user.first_name, ' ', reply_user.last_name),
              'profImg', reply_user.profile_picture,
              'first_name', reply_user.first_name,
              'last_name', reply_user.last_name
            ) ORDER BY reply.created_at ASC
          ), '[]'::json)
          FROM reviews reply
          LEFT JOIN users reply_user ON reply.user_id = reply_user.id
          WHERE reply.parent_id = r.id
        ) as replies,
        
        -- Count replies
        (
          SELECT COUNT(*)
          FROM reviews reply
          WHERE reply.parent_id = r.id
        ) as reply_count
        
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.company_id = $1 AND r.parent_id IS NULL
      ORDER BY 
        COALESCE(r.publish_time, r.created_at) DESC
    `;

    const reviewsResult = await pool.query(reviewsQuery, [companyId]);

    // 🎨 Format reviews based on source
    const formattedReviews = reviewsResult.rows.map(review => {
      if (review.source === 'google') {
        // Google Review
        return {
          id: review.id,
          company_id: review.company_id,
          user_id: null,
          userId: null,
          username: review.author_name || 'Google User',
          displayName: review.author_name || 'Google User',
          profile_picture: review.author_photo_url || null,
          author_photo_url: review.author_photo_url,
          author_profile_url: review.author_profile_url,
          google_maps_uri: review.google_maps_uri,
          rating: review.rating,
          text: review.text,
          created_at: review.publish_time || review.created_at,
          createdAt: review.publish_time || review.created_at,
          publish_time: review.publish_time,
          parent_id: null,
          source: 'google',
          language_code: review.language_code || 'en',
          replies: Array.isArray(review.replies) ? review.replies : [],
          reply_count: parseInt(review.reply_count) || 0,
          display_name: review.author_name || 'Google User',
          isCurrentUser: false,
        };
      } else {
        // Internal Review
        const displayName = review.first_name && review.last_name
          ? `${review.first_name} ${review.last_name}`.trim()
          : 'Anonymous';

        return {
          id: review.id,
          company_id: review.company_id,
          user_id: review.user_id,
          userId: review.user_id,
          username: displayName,
          displayName: displayName,
          first_name: review.first_name,
          last_name: review.last_name,
          profile_picture: review.profile_picture || null,
          rating: review.rating,
          text: review.text,
          created_at: review.created_at,
          createdAt: review.created_at,
          parent_id: null,
          source: 'internal',
          replies: Array.isArray(review.replies) ? review.replies : [],
          reply_count: parseInt(review.reply_count) || 0,
          display_name: displayName,
          isCurrentUser: false, // This will be set on frontend based on userId
        };
      }
    });

    // 📈 Calculate statistics
    const internalCount = formattedReviews.filter(r => r.source === 'internal').length;
    const googleCount = formattedReviews.filter(r => r.source === 'google').length;
    
    // Calculate average rating
    const ratingsOnly = formattedReviews.filter(r => r.rating !== null);
    const avgRating = ratingsOnly.length > 0
      ? (ratingsOnly.reduce((sum, r) => sum + r.rating, 0) / ratingsOnly.length).toFixed(1)
      : 0;

    // Rating distribution
    const ratingDistribution = {
      5: formattedReviews.filter(r => r.rating === 5).length,
      4: formattedReviews.filter(r => r.rating === 4).length,
      3: formattedReviews.filter(r => r.rating === 3).length,
      2: formattedReviews.filter(r => r.rating === 2).length,
      1: formattedReviews.filter(r => r.rating === 1).length,
    };

    res.status(200).json({
      company: {
        id: company.id,
        name: company.name,
        comp_profile_img: company.comp_profile_img,
      },
      reviews: formattedReviews,
      summary: {
        total: formattedReviews.length,
        internalReviews: internalCount,
        googleReviews: googleCount,
        totalReplies: formattedReviews.reduce((sum, r) => sum + r.reply_count, 0),
        avgRating: parseFloat(avgRating),
        ratingDistribution,
      }
    });

  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: err.message,
    });
  }
};

// export const getCompanyRatingStats = async (req, res) => {
//   try {
//     const { companyId } = req.params;

//     const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
//     if (!uuidRegex.test(companyId)) {
//       return res.status(400).json({ error: 'Invalid company ID' });
//     }

//     const result = await pool.query(
//       'SELECT AVG(rating) as total_rating, COUNT(*) as total_reviews FROM reviews WHERE company_id = $1 AND parent_id IS NULL AND rating IS NOT NULL',
//       [companyId]
//     );

//     const { total_rating, total_reviews } = result.rows[0];
//     res.status(200).json({
//       total_rating: total_rating ? parseFloat(total_rating).toFixed(1) : null,
//       total_reviews: parseInt(total_reviews),
//     });
//   } catch (err) {
//     console.error('Error fetching rating stats:', err);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

export const dislikeReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reviewId) || !uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid review ID or user ID' });
    }

    const userCheck = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      'INSERT INTO reviewDislikes (review_id, user_id) VALUES ($1, $2) RETURNING *',
      [reviewId, userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You have already disliked this review' });
    }
    console.error('Error disliking review:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeDislike = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reviewId) || !uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid review ID or user ID' });
    }

    const userCheck = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      'DELETE FROM reviewDislikes WHERE review_id = $1 AND user_id = $2 RETURNING *',
      [reviewId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dislike not found' });
    }

    res.status(200).json({ message: 'Dislike removed' });
  } catch (err) {
    console.error('Error removing dislike:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const editReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { userId, rating, text } = req.body;

    if (!userId || !text) {
      return res.status(400).json({ error: 'User ID and text are required' });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reviewId) || !uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid review ID or user ID' });
    }

    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const userCheck = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const reviewCheck = await pool.query('SELECT parent_id, user_id FROM reviews WHERE id = $1', [reviewId]);
    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const review = reviewCheck.rows[0];
    if (review.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to edit this review' });
    }

    const isReply = review.parent_id !== null;
    const query = isReply
      ? 'UPDATE reviews SET text = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *'
      : 'UPDATE reviews SET rating = $1, text = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *';
    const values = isReply ? [text, reviewId] : [rating || reviewCheck.rows[0].rating, text, reviewId];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('Error editing review:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // ✅ Check if reviewId is an internal review ID (format: internal-userId-idx)
    const isInternalReview = reviewId.startsWith('internal-');

    if (isInternalReview) {
      // 🧠 Handle internal review deletion from place_details
      
      // Extract userId from reviewId (format: internal-{userId}-{idx})
      const reviewIdParts = reviewId.split('-');
      const reviewUserId = reviewIdParts.slice(1, -1).join('-'); // Handle UUIDs with dashes
      
      if (reviewUserId !== userId) {
        return res.status(403).json({ error: 'Unauthorized to delete this review' });
      }

      // Find the company that has this review in place_details
      const companiesResult = await pool.query(
        `SELECT id, place_details FROM companies WHERE place_details IS NOT NULL`
      );

      let companyId = null;
      let updatedPlaceDetails = null;
      let reviewFound = false;

      for (const company of companiesResult.rows) {
        let placeDetails = company.place_details;
        if (typeof placeDetails === 'string') {
          placeDetails = JSON.parse(placeDetails);
        }

        if (placeDetails?.reviews && Array.isArray(placeDetails.reviews)) {
          const originalLength = placeDetails.reviews.length;
          
          // Filter out the review to delete
          placeDetails.reviews = placeDetails.reviews.filter(r => {
            if (r.source === 'internal' && r.userId === userId) {
              // Check if this is the review we want to delete by matching userId
              // Since we're filtering by userId, we'll delete the first matching one
              if (!reviewFound) {
                reviewFound = true;
                return false; // Remove this review
              }
            }
            return true; // Keep this review
          });

          if (placeDetails.reviews.length < originalLength) {
            // Review was found and removed
            companyId = company.id;
            updatedPlaceDetails = placeDetails;
            break;
          }
        }
      }

      if (!reviewFound) {
        return res.status(404).json({ error: 'Review not found' });
      }

      // Update the company's place_details
      await pool.query(
        `UPDATE companies SET place_details = $1 WHERE id = $2`,
        [JSON.stringify(updatedPlaceDetails), companyId]
      );

      // Recalculate average rating for the company
      await updateCompanyAvgRating(companyId);

      return res.status(200).json({ 
        message: 'Review deleted successfully from place_details',
        companyId 
      });

    } else {
      // 🧠 Handle regular review deletion from reviews table
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(reviewId) || !uuidRegex.test(userId)) {
        return res.status(400).json({ error: 'Invalid review ID or user ID' });
      }

      const userCheck = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const reviewCheck = await pool.query(
        'SELECT user_id, company_id FROM reviews WHERE id = $1', 
        [reviewId]
      );
      
      if (reviewCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Review not found' });
      }

      if (reviewCheck.rows[0].user_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized to delete this review' });
      }

      const companyId = reviewCheck.rows[0].company_id;

      const result = await pool.query(
        'DELETE FROM reviews WHERE id = $1 RETURNING *', 
        [reviewId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Review not found' });
      }

      // Recalculate average rating for the company
      await updateCompanyAvgRating(companyId);

      return res.status(200).json({ 
        message: 'Review deleted successfully from database',
        companyId 
      });
    }

  } catch (err) {
    console.error('Error deleting review:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      details: err.message 
    });
  }
};

// export const getCompanyRatingDistribution = async (req, res) => {
//   try {
//     const { companyId } = req.params;

//     const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
//     if (!uuidRegex.test(companyId)) {
//       return res.status(400).json({ error: 'Invalid company ID' });
//     }

//     const result = await pool.query(
//       'SELECT rating, COUNT(*) as count FROM reviews WHERE company_id = $1 AND parent_id IS NULL AND rating IS NOT NULL GROUP BY rating ORDER BY rating DESC',
//       [companyId]
//     );

//     const ratingDistribution = {
//       '5': 0,
//       '4': 0,
//       '3': 0,
//       '2': 0,
//       '1': 0
//     };

//     result.rows.forEach(row => {
//       ratingDistribution[row.rating.toString()] = parseInt(row.count);
//     });

//     res.status(200).json(ratingDistribution);
//   } catch (err) {
//     console.error('Error fetching rating distribution:', err);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

// Helper function to update company avg_rating
const updateCompanyAvgRating = async (companyId) => {
  try {
    const result = await pool.query(
      'SELECT AVG(rating) as avg_rating FROM reviews WHERE company_id = $1 AND parent_id IS NULL AND rating IS NOT NULL',
      [companyId]
    );
    const avgRating = result.rows[0].avg_rating ? parseFloat(result.rows[0].avg_rating).toFixed(1) : 0.0;

    await pool.query(
      'UPDATE companies SET avg_rating = $1 WHERE id = $2',
      [avgRating, companyId]
    );
  } catch (err) {
    console.error('Error updating company avg_rating:', err);
    throw err; // Let the caller handle the error
  }
};

export const addReview = async (req, res) => {
  try {
    const { companyId, userId, rating, text } = req.body;

    if (!companyId || !userId || !rating || !text) {
      return res.status(400).json({ error: 'Company ID, user ID, rating, and text are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // 👤 Fetch user details to get displayName
    const userRes = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];
    const displayName = `${user.first_name} ${user.last_name}`.trim();

    // 🧠 Check if company exists and fetch its current place_details
    const companyRes = await pool.query(
      'SELECT id, place_details FROM companies WHERE id = $1',
      [companyId]
    );

    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // 🧩 Insert new review into "reviews" table
    const result = await pool.query(
      `INSERT INTO reviews (company_id, user_id, rating, text)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [companyId, userId, rating, text]
    );

    // 🔁 Recalculate and update avg rating in the "companies" table
    await updateCompanyAvgRating(companyId);

    // 🧠 Update company.place_details JSON (to sync reviews)
    let placeDetails = companyRes.rows[0].place_details;
    if (!placeDetails) placeDetails = {};
    else if (typeof placeDetails === 'string') placeDetails = JSON.parse(placeDetails);

    const newReview = {
      userId,
      displayName,  // ✨ Added displayName here
      rating,
      text,
      source: 'internal',
      createdAt: new Date().toISOString(),
    };

    // Add to place_details.reviews
    if (!Array.isArray(placeDetails.reviews)) placeDetails.reviews = [];
    placeDetails.reviews.unshift(newReview);
    placeDetails.lastReviewUpdate = new Date().toISOString();

    // Save updated place_details back
    await pool.query(
      `UPDATE companies SET place_details = $1 WHERE id = $2`,
      [JSON.stringify(placeDetails), companyId]
    );

    res.status(201).json({
      message: '✅ Review added successfully and synced with company details',
      review: result.rows[0],
    });

  } catch (err) {
    console.error('❌ Error adding review:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addReviewByAdmin = async (req, res) => {
  try {
    const { companyId, username, rating, text } = req.body;

    // Validate required fields
    if (!companyId || !username || !rating || !text) {
      return res.status(400).json({ error: 'Company ID, username, rating, and text are required' });
    }

    // Validate companyId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(companyId)) {
      console.error('Invalid companyId format:', companyId);
      return res.status(400).json({ error: `Invalid company ID: ${companyId}. Must be a valid UUID.` });
    }

    // Validate rating
    if ( rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
    }

    // Verify company exists
    const companyCheck = await pool.query('SELECT 1 FROM companies WHERE id = $1', [companyId]);
    if (companyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const userId = randomUUID();

    console.log('Inserting review with params:', { companyId, userId, rating, text, username });

    // Insert review with generated userId and username as array
    const result = await pool.query(
      'INSERT INTO reviews (company_id, user_id, rating, text, username) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [companyId, userId, rating, text, username]
    );

    // Update company's avg_rating
    await updateCompanyAvgRating(companyId);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding review by admin:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

// Get review statistics for a company
export const getReviewStats = async (req, res) => {
  try {
    const { companyId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    // 🧠 Fetch company with place_details
    const companyResult = await pool.query(
      'SELECT id, place_details, avg_rating FROM companies WHERE id = $1',
      [companyId]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];
    
    // ✅ Parse reviews from place_details
    let totalReviews = 0;
    let totalRating = 0;
    
    try {
      const placeDetails = typeof company.place_details === 'string'
        ? JSON.parse(company.place_details)
        : company.place_details;

      if (placeDetails?.reviews && Array.isArray(placeDetails.reviews)) {
        // Count all reviews (both internal and Google)
        const validReviews = placeDetails.reviews.filter(r => r.rating != null);
        totalReviews = validReviews.length;
        
        // Calculate average rating
        if (totalReviews > 0) {
          const sum = validReviews.reduce((acc, r) => acc + (r.rating || 0), 0);
          totalRating = (sum / totalReviews).toFixed(1);
        }
      }
    } catch (err) {
      console.error("⚠️ Error parsing place_details JSON:", err.message);
    }

    // Return stats
    res.status(200).json({
      total_reviews: totalReviews,
      total_rating: parseFloat(totalRating),
      avg_rating: company.avg_rating || totalRating // Use company's avg_rating if available
    });

  } catch (err) {
    console.error('Error fetching review stats:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: err.message,
    });
  }
};

// Get rating distribution for a company
export const getRatingDistribution = async (req, res) => {
  try {
    const { companyId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    // 🧠 Fetch company with place_details
    const companyResult = await pool.query(
      'SELECT id, place_details FROM companies WHERE id = $1',
      [companyId]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const company = companyResult.rows[0];
    
    // ✅ Parse reviews from place_details and count by rating
    const ratingCounts = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0
    };
    
    try {
      const placeDetails = typeof company.place_details === 'string'
        ? JSON.parse(company.place_details)
        : company.place_details;

      if (placeDetails?.reviews && Array.isArray(placeDetails.reviews)) {
        placeDetails.reviews.forEach(review => {
          if (review.rating && review.rating >= 1 && review.rating <= 5) {
            const ratingKey = Math.floor(review.rating).toString();
            ratingCounts[ratingKey]++;
          }
        });
      }
    } catch (err) {
      console.error("⚠️ Error parsing place_details JSON:", err.message);
    }

    // Return distribution
    res.status(200).json(ratingCounts);

  } catch (err) {
    console.error('Error fetching rating distribution:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: err.message,
    });
  }
};



export const getRepliesForReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reviewId)) {
      return res.status(400).json({ error: 'Invalid review ID' });
    }

    const repliesQuery = `
      SELECT 
        r.id,
        r.text,
        r.user_id,
        r.created_at,
        u.first_name,
        u.last_name,
        u.profile_picture,
        CONCAT(u.first_name, ' ', u.last_name) as displayName
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.parent_id = $1
      ORDER BY r.created_at ASC
    `;

    const repliesResult = await pool.query(repliesQuery, [reviewId]);

    const formattedReplies = repliesResult.rows.map(reply => ({
      id: reply.id,
      text: reply.text,
      user_id: reply.user_id,
      userId: reply.user_id,
      first_name: reply.first_name,
      last_name: reply.last_name,
      displayName: reply.displayName || 'Anonymous',
      profile_picture: reply.profile_picture || null,
      created_at: reply.created_at,
      like_count: 0, // Add logic to fetch like count if needed
    }));

    res.status(200).json({
      replies: formattedReplies,
    });
  } catch (err) {
    console.error('Error fetching replies:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: err.message,
    });
  }
};


export const getLatestReviews = async (req, res) => {
  try {
    // 🧭 Optional query param: limit (default 20)
    const limit = parseInt(req.query.limit) || 20;

    // 📊 Fetch the latest reviews (internal + google)
    const reviewsQuery = `
      SELECT 
        r.id,
        r.company_id,
        c.name AS company_name,
        c.slug AS company_slug,
        c.comp_profile_img AS company_image,
        r.user_id,
        r.text,
        r.rating,
        r.created_at,
        r.source,
        
        -- Google-specific fields
        r.google_review_id,
        r.author_name,
        r.author_photo_url,
        r.author_profile_url,
        r.publish_time,
        r.google_maps_uri,
        r.language_code,

        -- Internal user fields
        u.first_name,
        u.last_name,
        u.profile_picture,

        -- Replies count
        (
          SELECT COUNT(*) 
          FROM reviews reply 
          WHERE reply.parent_id = r.id
        ) AS reply_count

      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN companies c ON r.company_id = c.id
      WHERE r.parent_id IS NULL
      ORDER BY COALESCE(r.publish_time, r.created_at) DESC
      LIMIT $1
    `;

    const { rows } = await pool.query(reviewsQuery, [limit]);

    // 🎨 Format reviews
    const formattedReviews = rows.map(review => {
      if (review.source === "google") {
        return {
          id: review.id,
          companyId: review.company_id,
          companyName: review.company_name,
          companyImage: review.company_image,
          userId: null,
          slug: review.company_slug,
          displayName: review.author_name || "Google User",
          profImg: review.author_photo_url || null,
          rating: review.rating,
          text: review.text,
          createdAt: review.publish_time || review.created_at,
          source: "google",
          googleMapsUri: review.google_maps_uri,
          authorProfileUrl: review.author_profile_url,
          replyCount: parseInt(review.reply_count) || 0,
        };
      } else {
        const displayName =
          review.first_name && review.last_name
            ? `${review.first_name} ${review.last_name}`.trim()
            : "Anonymous";

        return {
          id: review.id,
          companyId: review.company_id,
          companyName: review.company_name,
          companyImage: review.company_image,
          userId: review.user_id,
          slug: review.company_slug,
          displayName,
          profImg: review.profile_picture || null,
          rating: review.rating,
          text: review.text,
          createdAt: review.created_at,
          source: "internal",
          replyCount: parseInt(review.reply_count) || 0,
        };
      }
    });

    // 📦 Response
    res.status(200).json({
      count: formattedReviews.length,
      limit,
      reviews: formattedReviews,
    });
  } catch (err) {
    console.error("Error fetching latest reviews:", err);
    res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
};
