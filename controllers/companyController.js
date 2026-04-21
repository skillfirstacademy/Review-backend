import { slugify } from '../utils/slugify.js';
import axios from "axios";
import express from 'express';
const router = express.Router();
import pool from '../config/db.js';
import { unescape } from "querystring";


export const getAllCompanies = async (req, res) => {
  try {
    const query = `
      SELECT 
        c.id,
        c.name,
        c.slug,  -- ✅ Added slug
        c.address,
        c.website_link,
        c.google_map_link,
        c.categories,
        c.gstin_num,
        c.business_email,
        c.business_phone_text,
        c.social_links,
        c.avg_rating,
        c.rating_count,
        c.google_rating,
        c.google_user_rating_count,
        c.google_place_id,
        c.latitude,
        c.longitude,
        c.place_details,
        c.last_google_fetch,
        c.comp_profile_img,
        c.description,
        c.isverified,
        c.isblocked,
        c.userid,
        c.created_at,
        c.updated_at,
        c.status,
        u.first_name,
        u.last_name,
        u.email AS user_email
      FROM companies c
      LEFT JOIN users u ON c.userid = u.id
      ORDER BY c.created_at DESC
    `;

    const result = await pool.query(query);

    // 🔄 Process each company to extract reviews and enhance data
    const companiesWithReviews = result.rows.map(company => {
      let reviews = [];
      let reviewSummary = null;
      let businessStatus = null;
      let openingHours = null;

      // Extract data from place_details JSON
      if (company.place_details) {
        try {
          const details = typeof company.place_details === 'string'
            ? JSON.parse(company.place_details)
            : company.place_details;

          reviews = details.reviews || [];
          businessStatus = details.businessStatus || null;
          openingHours = details.currentOpeningHours || details.openingHours || null;

          // Create review summary
          if (reviews.length > 0) {
            const ratings = reviews.map(r => r.rating);
            reviewSummary = {
              total: reviews.length,
              averageRating: (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1),
              ratingDistribution: {
                5: reviews.filter(r => r.rating === 5).length,
                4: reviews.filter(r => r.rating === 4).length,
                3: reviews.filter(r => r.rating === 3).length,
                2: reviews.filter(r => r.rating === 2).length,
                1: reviews.filter(r => r.rating === 1).length,
              },
              latestReview: reviews[0]?.relativePublishTimeDescription || null,
            };
          }
        } catch (parseError) {
          console.error(`⚠️ Failed to parse place_details for company ${company.id}:`, parseError.message);
        }
      }

      return {
        id: company.id,
        name: company.name,
        slug: company.slug, // ✅ Added slug to response
        address: company.address,
        websiteLink: company.website_link,
        googleMapLink: company.google_map_link,
        categories: company.categories,
        gstinNum: company.gstin_num,
        businessEmail: company.business_email,
        businessPhone: company.business_phone_text,
        socialLinks: company.social_links,

        // Rating information
        avgRating: company.avg_rating,
        ratingCount: company.rating_count,
        googleRating: company.google_rating,
        googleUserRatingCount: company.google_user_rating_count,

        // Location information
        googlePlaceId: company.google_place_id,
        latitude: company.latitude,
        longitude: company.longitude,

        // Profile information
        profileImage: company.comp_profile_img,
        description: company.description,

        // Status flags
        isVerified: company.isverified,
        isBlocked: company.isblocked,
        status: company.status,

        // Google data metadata
        lastGoogleFetch: company.last_google_fetch,
        businessStatus: businessStatus,
        openingHours: openingHours,

        // Reviews
        reviews: reviews,
        reviewSummary: reviewSummary,

        // User information
        userId: company.userid,
        owner: company.userid ? {
          firstName: company.first_name,
          lastName: company.last_name,
          email: company.user_email,
        } : null,

        // Timestamps
        createdAt: company.created_at,
        updatedAt: company.updated_at,
      };
    });

    res.status(200).json({
      message: "✅ Companies fetched successfully!",
      count: result.rowCount,
      data: companiesWithReviews,
    });

  } catch (error) {
    console.error("❌ Error fetching companies:", error);
    res.status(500).json({ error: "Internal server error while fetching companies." });
  }
};

// 🆕 Optional: Get single company with detailed reviews
export const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        c.*,
        u.first_name,
        u.last_name,
        u.email AS user_email,
        u.phone AS user_phone
      FROM companies c
      LEFT JOIN users u ON c.userid = u.id
      WHERE c.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    const company = result.rows[0];
    let reviews = [];
    let placeDetails = null;

    // Extract and format place details
    if (company.place_details) {
      try {
        placeDetails = typeof company.place_details === 'string'
          ? JSON.parse(company.place_details)
          : company.place_details;

        reviews = placeDetails.reviews || [];
      } catch (parseError) {
        console.error(`⚠️ Failed to parse place_details:`, parseError);
      }
    }

    res.status(200).json({
      message: "✅ Company fetched successfully!",
      data: {
        ...company,
        owner: company.userid ? {
          firstName: company.first_name,
          lastName: company.last_name,
          email: company.user_email,
          phone: company.user_phone,
        } : null,
        reviews: reviews,
        reviewCount: reviews.length,
        placeDetails: placeDetails,
      },
    });

  } catch (error) {
    console.error("❌ Error fetching company:", error);
    res.status(500).json({ error: "Internal server error while fetching company." });
  }
};

export const getCompanyByName = async (req, res) => {
  try {
    const {slug}  = req.params;

    if (!slug) {
      return res.status(400).json({ error: "Slug is required" });
    }

    console.log("🔍 Fetching company by slug:", slug);

    const result = await pool.query(
      "SELECT * FROM companies WHERE slug = $1",
      [slug.trim()]
    );

    if (result.rows.length === 0) {
      console.warn("⚠️ Company not found for slug:", slug);
      return res.status(404).json({ error: "Company not found" });
    }

    const company = result.rows[0];

    let placeDetails = null;
    try {
      if (company.place_details) {
        placeDetails =
          typeof company.place_details === "string"
            ? JSON.parse(company.place_details)
            : company.place_details;
      }
    } catch (err) {
      console.warn("⚠️ Failed to parse place_details:", err.message);
    }

    res.status(200).json({
      message: "✅ Company fetched successfully by slug!",
      data: {
        ...company,
        placeDetails,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching company by slug:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};


// 🆕 Optional: Get only reviews for a company
export const getCompanyReviews = async (req, res) => {
  try {
    const { companyId } = req.params;

    // Fetch all reviews (both internal and Google) with replies
    const reviewsQuery = `
      SELECT 
        r.id,
        r.company_id,
        r.user_id,
        r.text,
        r.rating,
        r.created_at,
        r.source,
        r.google_review_id,
        r.author_name,
        r.author_photo_url,
        r.author_profile_url,
        r.publish_time,
        r.google_maps_uri,
        r.language_code,
        u.first_name,
        u.last_name,
        u.profile_picture,
        (
          SELECT json_agg(
            json_build_object(
              'id', reply.id,
              'text', reply.text,
              'userId', reply.user_id,
              'createdAt', reply.created_at,
              'displayName', CONCAT(reply_user.first_name, ' ', reply_user.last_name),
              'profImg', reply_user.profile_picture
            ) ORDER BY reply.created_at ASC
          )
          FROM reviews reply
          LEFT JOIN users reply_user ON reply.user_id = reply_user.id
          WHERE reply.parent_id = r.id
        ) as replies
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.company_id = $1 AND r.parent_id IS NULL
      ORDER BY r.created_at DESC
    `;

    const result = await pool.query(reviewsQuery, [companyId]);

    // Format reviews based on source
    const formattedReviews = result.rows.map(review => {
      if (review.source === 'google') {
        return {
          id: review.id,
          company_id: review.company_id,
          text: review.text,
          rating: review.rating,
          created_at: review.publish_time || review.created_at,
          source: 'google',
          displayName: review.author_name,
          profile_picture: review.author_photo_url,
          authorProfileUrl: review.author_profile_url,
          googleMapsUri: review.google_maps_uri,
          replies: review.replies || []
        };
      } else {
        // Internal review
        return {
          id: review.id,
          company_id: review.company_id,
          user_id: review.user_id,
          text: review.text,
          rating: review.rating,
          created_at: review.created_at,
          source: 'internal',
          first_name: review.first_name,
          last_name: review.last_name,
          displayName: `${review.first_name} ${review.last_name}`.trim(),
          profile_picture: review.profile_picture,
          replies: review.replies || []
        };
      }
    });

    res.status(200).json(formattedReviews);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
};

export const addComp = async (req, res) => {
  console.log("✅ [addComp] API endpoint hit");

  try {
    // ✅ Handle text fields
    const {
      name,
      address,
      website_link,
      google_map_link,
      categories,
      gstin_num,
      business_email,
      business_phone_text,
      social_links,
      description,
      userId
    } = req.body;

    console.log("📦 Incoming body:", req.body);
    console.log("📁 Incoming files:", req.files);

    // ✅ Basic field validation
    if (!name || !address || !business_email || !gstin_num || !userId) {
      return res.status(400).json({
        error: "Fill in all required details, including userId."
      });
    }

    // ✅ Fetch user details to check subscription
    const userResult = await pool.query(
      `SELECT "noOfComp", subscription FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const { noOfComp, subscription } = userResult.rows[0];

    if (noOfComp >= 1 && subscription === "free") {
      return res.status(403).json({
        error: "Users can only add up to 2 companies on a free plan. Please upgrade to a paid subscription."
      });
    }

    // ✅ Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(business_email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    // ✅ GSTIN validation
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstRegex.test(gstin_num.toUpperCase())) {
      return res.status(400).json({ error: "Invalid GSTIN format." });
    }

    // ✅ Phone validation
    if (business_phone_text && !/^[+]?[\d\s\-()]{10,15}$/.test(business_phone_text)) {
      return res.status(400).json({ error: "Invalid phone number format." });
    }

    // ✅ URL validation
    const urlRegex = /^https?:\/\/.+/;
    if (website_link && !urlRegex.test(website_link)) {
      return res.status(400).json({ error: "Website URL should start with http:// or https://" });
    }
    if (google_map_link && !urlRegex.test(google_map_link)) {
      return res.status(400).json({ error: "Google Map URL should start with http:// or https://" });
    }

    // ✅ Social links validation
    let processedSocialLinks = null;
    let socialLinksObj = social_links;

    if (social_links) {
      if (typeof social_links === "string") {
        try {
          socialLinksObj = JSON.parse(social_links);
        } catch (e) {
          return res.status(400).json({ error: "Invalid social_links JSON format." });
        }
      }

      if (typeof socialLinksObj !== "object" || Array.isArray(socialLinksObj)) {
        return res.status(400).json({ error: "Social links must be an object with URLs." });
      }

      const nonEmptyLinks = {};
      const linkRegex = /^https?:\/\/.+/;
      for (const [key, val] of Object.entries(socialLinksObj)) {
        if (val && linkRegex.test(val.trim())) {
          nonEmptyLinks[key] = val.trim();
        }
      }

      if (Object.keys(nonEmptyLinks).length > 0) {
        processedSocialLinks = JSON.stringify(nonEmptyLinks);
      }
    }

    // ✅ Categories
    let processedCategories = null;
    if (categories) {
      if (Array.isArray(categories)) {
        processedCategories = JSON.stringify(categories.filter(c => c.trim()));
      } else if (typeof categories === "string") {
        processedCategories = JSON.stringify(
          categories.split(",").map(c => c.trim()).filter(Boolean)
        );
      }
    }

    // ✅ Image from multer
    const compProfileImg =
      req.files?.comp_profile_img?.[0]?.filename || null;

    // ✅ GST verification (optional)
    let gstVerified = false;
    if (process.env.APPLYFLOW_API_KEY) {
      try {
        const gstResponse = await axios.get("https://appyflow.in/api/verifyGST", {
          params: {
            key_secret: process.env.APPLYFLOW_API_KEY,
            gstNo: gstin_num.toUpperCase(),
          },
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        });

        if (gstResponse.data?.taxpayerInfo?.sts === "Active") {
          gstVerified = true;
        }
      } catch (error) {
        console.warn("⚠️ GST verification skipped:", error.message);
      }
    }

    // ✅ Generate unique slug automatically
    const baseSlug = slugify(name);
    let finalSlug = baseSlug;

    const existingSlug = await pool.query(
      'SELECT COUNT(*) FROM companies WHERE slug = $1',
      [baseSlug]
    );

    if (parseInt(existingSlug.rows[0].count) > 0) {
      finalSlug = `${baseSlug}-${Date.now()}`; // unique fallback
    }

    // ✅ Start DB transaction
    await pool.query("BEGIN");

    try {
      const result = await pool.query(
        `INSERT INTO companies 
          (name, slug, address, website_link, google_map_link, categories, gstin_num, 
           business_email, business_phone_text, social_links, avg_rating, 
           comp_profile_img, description, "isverified", userId)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          name.trim(),
          finalSlug, // 👈 New slug added here
          address.trim(),
          website_link || null,
          google_map_link || null,
          processedCategories,
          gstin_num.toUpperCase(),
          business_email.toLowerCase().trim(),
          business_phone_text || null,
          processedSocialLinks,
          null, // avg_rating
          compProfileImg,
          description || null,
          gstVerified,
          userId
        ]
      );

      await pool.query(
        `UPDATE users SET "noOfComp" = "noOfComp" + 1 WHERE id = $1`,
        [userId]
      );

      await pool.query("COMMIT");

      console.log("✅ Company added successfully:", result.rows[0]);
      return res.status(201).json({
        message: "Company registered successfully!",
        company: result.rows[0],
        gstin_verified: gstVerified,
      });

    } catch (error) {
      await pool.query("ROLLBACK").catch(() => {});
      console.error("❌ Transaction failed:", error.message);
      return res.status(500).json({ error: "Database transaction failed.", details: error.message });
    }

  } catch (err) {
    console.error("❌ Controller-level error:", err.message);
    if (err.code === "23505") {
      if (err.constraint?.includes("business_email")) {
        return res.status(400).json({ error: "A company with this email already exists." });
      }
      if (err.constraint?.includes("gstin_num")) {
        return res.status(400).json({ error: "A company with this GSTIN already exists." });
      }
    }
    return res.status(500).json({ error: "Internal server error.", details: err.message });
  }
};

export const deleteComp = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM companies WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    res.json({
      message: "Company deleted successfully!",
      deletedCompany: result.rows[0]
    });
  } catch (err) {
    console.error("Error deleting company:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update company by ID
export const updateComp = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Check if company exists
    const existing = await pool.query("SELECT * FROM companies WHERE id = $1", [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Company not found" });
    }
    const company = existing.rows[0];

    // 2. Extract fields
    const {
      name,
      address,
      description,
      website_link,
      google_map_link,
      categories,
      gstin_num,
      business_email,
      social_links,
      business_phone_text,
    } = req.body;

    // 3. Handle file upload (multer)
    let comp_profile_img = company.comp_profile_img;
    if (req.files?.comp_profile_img?.[0]) {
      comp_profile_img = req.files.comp_profile_img[0].filename;
    }

    // 4. Parse categories safely
    let parsedCategories = company.categories;
    if (categories !== undefined) {
      if (Array.isArray(categories)) {
        parsedCategories = categories;
      } else if (typeof categories === "string") {
        try {
          parsedCategories = JSON.parse(categories);
        } catch {
          parsedCategories = categories.split(",").map(c => c.trim()).filter(Boolean);
        }
      } else {
        parsedCategories = [categories];
      }
    }

    // 5. Parse social_links safely
    let parsedSocialLinks = company.social_links;
    if (social_links !== undefined) {
      try {
        parsedSocialLinks = typeof social_links === "string" ? JSON.parse(social_links) : social_links;
      } catch (e) {
        console.warn("Invalid social_links JSON, keeping old");
      }
    }

    // 6. Update query (FIXED: added missing comma!)
    const query = `
      UPDATE companies SET
        name = $1,
        address = $2,
        description = $3,
        website_link = $4,
        google_map_link = $5,
        categories = $6,
        gstin_num = $7,
        business_email = $8,
        social_links = $9,
        business_phone_text = $10,
        comp_profile_img = $11
      WHERE id = $12
      RETURNING *
    `;

    const values = [
      name?.trim() || company.name,
      address?.trim() || company.address,
      description?.trim() || company.description,
      website_link?.trim() || company.website_link,
      google_map_link?.trim() || company.google_map_link,
      JSON.stringify(parsedCategories),
      gstin_num?.trim() || company.gstin_num,
      business_email?.trim() || company.business_email,
      JSON.stringify(parsedSocialLinks),
      business_phone_text?.trim() || company.business_phone_text,
      comp_profile_img,
      id
    ];

    const result = await pool.query(query, values);

    res.json({
      message: "Company updated successfully!",
      company: result.rows[0]
    });

  } catch (err) {
    console.log("Update error:", err);
    res.status(500).json({ 
      error: "Internal server error",
      details: err.message 
    });
  }
};

export const getbyIdComp = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string" || !id.trim()) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    const query = `
      SELECT 
        id,
        name,
        slug, -- ✅ Added slug here
        address,
        website_link,
        google_map_link,
        categories,
        gstin_num,
        business_email,
        business_phone_text,
        social_links,
        avg_rating,
        rating_count,
        google_rating,
        google_user_rating_count,
        google_place_id,
        latitude,
        longitude,
        place_details,
        last_google_fetch,
        comp_profile_img,
        description,
        isverified,
        isblocked,
        userid,
        created_at,
        updated_at,
        status
      FROM companies
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    const company = result.rows[0];

    // ✅ Parse JSON fields safely
    let placeDetails = null;
    try {
      if (company.place_details) {
        placeDetails =
          typeof company.place_details === "string"
            ? JSON.parse(company.place_details)
            : company.place_details;
      }
    } catch (parseError) {
      console.warn(`⚠️ Failed to parse place_details for company ${company.id}:`, parseError.message);
    }

    res.status(200).json({
      message: "✅ Company fetched successfully by ID!",
      data: {
        ...company,
        placeDetails,
      },
    });

  } catch (err) {
    console.error("❌ Error fetching company by ID:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};


export const getbyUserIdCompany = async (req, res) => {
  try {
    const { userId } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userId || !uuidRegex.test(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const result = await pool.query(
      'SELECT * FROM companies WHERE userid = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No company found for this user' });
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching company by user ID:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const verifyComp = async (req, res) => {
  try {
    const { id } = req.params;

    // Update isverified to true
    const result = await pool.query(
      "UPDATE companies SET isverified = true WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    res.json({
      message: "Company verified successfully",
      company: result.rows[0]
    });
  } catch (err) {
    console.error("Error verifying company:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const makePremium = async (req, res) => {
  try {
    const { id } = req.params;

    // Update status to 'premium'
    const result = await pool.query(
      "UPDATE companies SET status = 'premium' WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    res.json({
      message: "Company upgraded to premium successfully",
      company: result.rows[0]
    });
  } catch (err) {
    console.error("Error upgrading company to premium:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const blockComp = async (req, res) => {
  try {
    const { id } = req.params;

    // Update isBlocked to true
    const result = await pool.query(
      "UPDATE companies SET isBlocked = true WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    res.json({
      message: "Company blocked successfully",
      company: result.rows[0]
    });
  } catch (err) {
    console.error("Error blocking company:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const unblockComp = async (req, res) => {
  try {
    const { id } = req.params;

    // Update isBlocked to false
    const result = await pool.query(
      "UPDATE companies SET isBlocked = false WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    res.json({
      message: "Company unblocked successfully",
      company: result.rows[0]
    });
  } catch (err) {
    console.error("Error unblocking company:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const fetchAndStoreCompaniesFromGoogle = async (req, res) => {
  try {
    const { queryText } = req.body || {};

    if (!queryText || typeof queryText !== "string" || !queryText.trim()) {
      return res.status(400).json({
        error: "queryText is required (e.g. 'software companies in Bangalore')",
      });
    }

    console.log("🔍 Searching Google for:", queryText);

    const response = await axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      { textQuery: queryText },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.types,places.location,places.photos",
        },
      }
    );

    const places = response.data?.places || [];

    if (places.length === 0) {
      return res.status(404).json({ message: "No companies found from Google." });
    }

    const fetchPlaceDetails = async (placeId) => {
      try {
        const detailResponse = await axios.get(
          `https://places.googleapis.com/v1/places/${placeId}`,
          {
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
              "X-Goog-FieldMask":
                "id,displayName,reviews,editorialSummary,currentOpeningHours,businessStatus,rating,userRatingCount,photos",
            },
          }
        );

        const reviewCount = detailResponse.data?.reviews?.length || 0;
        // console.log(`✅ Fetched details - Reviews found: ${reviewCount}`);
        return detailResponse.data;
      } catch (err) {
        console.error(
          `❌ Failed to fetch details for place ${placeId}:`,
          err.response?.data || err.message
        );
        return null;
      }
    };

    // ✅ Added slug column
    const insertCompanyQuery = `
      INSERT INTO public.companies (
        name, slug, address, website_link, google_map_link, business_email, business_phone_text, 
        avg_rating, rating_count, google_place_id, google_user_rating_count, google_rating, 
        latitude, longitude, categories, place_details, last_google_fetch, userid, isverified, comp_profile_img
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18,$19,$20
      )
      ON CONFLICT (google_place_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        address = EXCLUDED.address,
        website_link = EXCLUDED.website_link,
        google_map_link = EXCLUDED.google_map_link,
        avg_rating = EXCLUDED.avg_rating,
        rating_count = EXCLUDED.rating_count,
        google_rating = EXCLUDED.google_rating,
        google_user_rating_count = EXCLUDED.google_user_rating_count,
        business_phone_text = EXCLUDED.business_phone_text,
        place_details = EXCLUDED.place_details,
        last_google_fetch = EXCLUDED.last_google_fetch,
        comp_profile_img = EXCLUDED.comp_profile_img
      RETURNING id;
    `;

    const insertReviewQuery = `
      INSERT INTO public.reviews (
        company_id, google_review_id, text, rating, 
        author_name, author_photo_url, author_profile_url,
        publish_time, google_maps_uri, source, language_code, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (google_review_id) 
      DO UPDATE SET
        text = EXCLUDED.text,
        rating = EXCLUDED.rating,
        author_name = EXCLUDED.author_name,
        author_photo_url = EXCLUDED.author_photo_url,
        publish_time = EXCLUDED.publish_time
      RETURNING id;
    `;

    await pool.query("BEGIN");

    let inserted = 0;
    let totalReviewsInserted = 0;
    const processedPlaces = [];
    const errors = [];

    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      // console.log(`\n📦 Processing ${i + 1}/${places.length}: ${place.displayName?.text}`);

      const placeDetails = await fetchPlaceDetails(place.id);
      await new Promise((resolve) => setTimeout(resolve, 200));

      let comp_profile_img = null;
      if (placeDetails?.photos && placeDetails.photos.length > 0) {
        const photoName = placeDetails.photos[0].name;
        comp_profile_img = `https://places.googleapis.com/v1/${photoName}/media?key=${process.env.GOOGLE_PLACES_API_KEY}&maxHeightPx=400`;
      } else if (place.photos && place.photos.length > 0) {
        const photoName = place.photos[0].name;
        comp_profile_img = `https://places.googleapis.com/v1/${photoName}/media?key=${process.env.GOOGLE_PLACES_API_KEY}&maxHeightPx=400`;
      }

      const placeDetailsWithoutReviews = {
        id: place.id,
        displayName: place.displayName,
        formattedAddress: place.formattedAddress,
        location: place.location,
        types: place.types,
        editorialSummary: placeDetails?.editorialSummary || null,
        currentOpeningHours: placeDetails?.currentOpeningHours || null,
        businessStatus: placeDetails?.businessStatus || null,
        detailFetchedAt: new Date().toISOString(),
      };

      // ✅ Generate unique slug for Google imported companies
      const baseSlug = slugify(place.displayName?.text || "Unknown");
      let finalSlug = baseSlug;
      const existingSlug = await pool.query(
        "SELECT COUNT(*) FROM companies WHERE slug = $1",
        [baseSlug]
      );

      if (parseInt(existingSlug.rows[0].count) > 0) {
        finalSlug = `${baseSlug}-${Date.now()}`;
      }

      const companyValues = [
        place.displayName?.text || "Unknown", // name
        finalSlug, // ✅ slug
        place.formattedAddress || null,
        place.websiteUri || null,
        place.googleMapsUri || null,
        null, // Google doesn't provide business email
        place.internationalPhoneNumber || null,
        place.rating || null,
        place.userRatingCount || null,
        place.id || null,
        place.userRatingCount || null,
        place.rating || null,
        place.location?.latitude || null,
        place.location?.longitude || null,
        JSON.stringify(place.types || []),
        JSON.stringify(placeDetailsWithoutReviews),
        new Date().toISOString(),
        null, // userId = null for Google imports
        true, // isverified = true
        comp_profile_img,
      ];

      try {
        const companyResult = await pool.query(insertCompanyQuery, companyValues);
        const companyId = companyResult.rows[0]?.id;
        inserted++;

        let reviewsInserted = 0;
        if (placeDetails?.reviews && Array.isArray(placeDetails.reviews)) {
          for (const review of placeDetails.reviews) {
            try {
              const reviewValues = [
                companyId,
                review.name || null,
                review.text?.text || review.originalText?.text || "",
                review.rating || null,
                review.authorAttribution?.displayName || "Anonymous",
                review.authorAttribution?.photoUri || null,
                review.authorAttribution?.uri || null,
                review.publishTime ? new Date(review.publishTime) : null,
                review.googleMapsUri || null,
                "google",
                review.text?.languageCode ||
                  review.originalText?.languageCode ||
                  "en",
                new Date(),
              ];

              await pool.query(insertReviewQuery, reviewValues);
              reviewsInserted++;
            } catch (reviewError) {
              console.error(`⚠️ Failed to insert review:`, reviewError.message);
            }
          }
        }

        totalReviewsInserted += reviewsInserted;

        processedPlaces.push({
          companyId: companyId,
          placeName: place.displayName?.text,
          placeId: place.id,
          slug: finalSlug, // ✅ Added for debugging
          reviewCount: reviewsInserted,
          googleRating: place.rating,
          userRatingCount: place.userRatingCount,
          detailsFetched: placeDetails !== null,
          comp_profile_img: comp_profile_img,
        });
      } catch (dbError) {
        console.error(
          `❌ Database error for ${place.displayName?.text}:`,
          dbError.message
        );
        errors.push({
          placeName: place.displayName?.text,
          placeId: place.id,
          error: dbError.message,
        });
      }
    }

    await pool.query("COMMIT");

    return res.status(201).json({
      message: `✅ Successfully stored ${inserted} companies and ${totalReviewsInserted} reviews from Google.`,
      count: inserted,
      reviewsCount: totalReviewsInserted,
      processed: processedPlaces,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        totalProcessed: places.length,
        successfulInserts: inserted,
        failedInserts: errors.length,
        placesWithReviews: processedPlaces.filter((p) => p.reviewCount > 0)
          .length,
        totalReviews: totalReviewsInserted,
        placesWithImages: processedPlaces.filter((p) => p.comp_profile_img)
          .length,
      },
    });
  } catch (err) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error("❌ Google insert error:", err.response?.data || err.message);

    return res.status(500).json({
      error: err.response?.data || err.message,
      details: err.response?.data || "Check server logs for more details",
    });
  }
};

export const refreshCompanyReviews = async (req, res) => {
  try {
    const { companyId } = req.params;
    const getQuery = `
      SELECT id, name, google_place_id 
      FROM companies 
      WHERE ${companyId ? 'id = $1' : 'google_place_id IS NOT NULL'}
    `;

    const params = companyId ? [companyId] : [];
    const companies = await pool.query(getQuery, params);

    if (companies.rowCount === 0) {
      return res.status(404).json({ error: "No companies found with Google IDs" });
    }

    const updated = [];
    const failed = [];

    for (const company of companies.rows) {
      try {
        const detailResponse = await axios.get(
          `https://places.googleapis.com/v1/places/${company.google_place_id}`,
          {
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
              "X-Goog-FieldMask": "id,displayName,reviews,rating,userRatingCount,businessStatus,currentOpeningHours",
            },
          }
        );

        const reviews = detailResponse.data?.reviews || [];

        // Update place_details in database
        const updateQuery = `
          UPDATE companies 
          SET 
            place_details = $1,
            google_rating = $2,
            google_user_rating_count = $3,
            last_google_fetch = $4
          WHERE id = $5
          RETURNING id, name
        `;

        const placeDetails = {
          ...detailResponse.data,
          refreshedAt: new Date().toISOString(),
        };

        await pool.query(updateQuery, [
          JSON.stringify(placeDetails),
          detailResponse.data?.rating || null,
          detailResponse.data?.userRatingCount || null,
          new Date().toISOString(),
          company.id,
        ]);

        updated.push({
          companyId: company.id,
          companyName: company.name,
          reviewCount: reviews.length,
        });

        // console.log(`✅ Updated ${company.name} - ${reviews.length} reviews`);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        console.error(`❌ Failed to refresh ${company.name}:`, err.message);
        failed.push({
          companyId: company.id,
          companyName: company.name,
          error: err.message,
        });
      }
    }

    return res.status(200).json({
      message: `✅ Refreshed ${updated.length} companies`,
      updated: updated,
      failed: failed.length > 0 ? failed : undefined,
      summary: {
        totalAttempted: companies.rowCount,
        successful: updated.length,
        failed: failed.length,
        totalReviewsFetched: updated.reduce((sum, u) => sum + u.reviewCount, 0),
      }
    });

  } catch (err) {
    console.error("❌ Refresh error:", err.message);
    return res.status(500).json({
      error: err.message,
    });
  }
};

export const searchGooglePlaces = async (req, res) => {
  try {
    const { queryText } = req.body;

    if (!queryText || typeof queryText !== 'string' || !queryText.trim()) {
      return res.status(400).json({ error: 'queryText is required and must be a non-empty string' });
    }

    // console.log('🔍 Searching Google Autocomplete for:', queryText);
    const autocompleteResponse = await axios.get(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(queryText)}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );

    if (autocompleteResponse.data.status !== 'OK' || !autocompleteResponse.data.predictions.length) {
      return res.status(404).json({ message: 'No results found from Google Autocomplete' });
    }

    const placeIds = autocompleteResponse.data.predictions.map((p) => p.place_id);

    // Fetch basic details for each place
    const fetchPlaceBasicDetails = async (placeId) => {
      try {
        const detailResponse = await axios.get(
          `https://places.googleapis.com/v1/places/${placeId}`,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
              // ✅ Added "photos" in field mask to fetch company profile image
              'X-Goog-FieldMask': 'id,displayName,formattedAddress,websiteUri,googleMapsUri,internationalPhoneNumber,rating,userRatingCount,types,location,businessStatus,photos',
            },
          }
        );

        const place = detailResponse.data;

        // ✅ Extract company profile image if available
        let comp_profile_img = null;
        if (place.photos && place.photos.length > 0) {
          const photoName = place.photos[0].name; // e.g. "places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/abc123"
          comp_profile_img = `https://places.googleapis.com/v1/${photoName}/media?key=${process.env.GOOGLE_PLACES_API_KEY}&maxHeightPx=400`;
        }

        return {
          placeId: place.id,
          name: place.displayName?.text || 'Unknown',
          address: place.formattedAddress || null,
          websiteLink: place.websiteUri || null,
          googleMapLink: place.googleMapsUri || null,
          businessPhone: place.internationalPhoneNumber || null,
          googleRating: place.rating || null,
          googleUserRatingCount: place.userRatingCount || null,
          latitude: place.location?.latitude || null,
          longitude: place.location?.longitude || null,
          categories: place.types || [],
          businessStatus: place.businessStatus || null,
          comp_profile_img: comp_profile_img || null, // ✅ added new field
          isverified: true,
        };
      } catch (err) {
        console.error(`❌ Failed to fetch details for place ${placeId}:`, err.response?.data || err.message);
        return null;
      }
    };

    const places = [];
    for (const placeId of placeIds) {
      const place = await fetchPlaceBasicDetails(placeId);
      if (place) {
        places.push(place);
      }
      // Rate limiting to avoid API quota hit
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return res.status(200).json({
      message: `Found ${places.length} places from Google`,
      count: places.length,
      places: places,
    });
  } catch (err) {
    console.error('❌ Google search error:', err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data?.error?.message || err.message,
      details: 'Check server logs for more details',
    });
  }
};


export const storeSingleCompany = async (req, res) => {
  try {
    const { placeId } = req.body;

    if (!placeId) {
      return res.status(400).json({ error: "placeId is required" });
    }

    console.log("🔍 Fetching company details for placeId:", placeId);

    // 1️⃣ Fetch BASIC place details first
    const basicResponse = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,websiteUri,googleMapsUri,internationalPhoneNumber,rating,userRatingCount,types,location,photos"
        }
      }
    );

    const place = basicResponse.data;

    // 2️⃣ Fetch DETAILED place info (reviews, opening hours, editorial summary, etc.)
    const detailResponse = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask":
            "id,displayName,reviews,editorialSummary,currentOpeningHours,businessStatus,rating,userRatingCount,photos"
        }
      }
    );

    const placeDetails = detailResponse.data;
    console.log(`✅ Reviews found: ${placeDetails?.reviews?.length || 0}`);

    // 3️⃣ Get profile image
    let comp_profile_img = null;
    if (placeDetails?.photos && placeDetails.photos.length > 0) {
      const photoName = placeDetails.photos[0].name;
      comp_profile_img = `https://places.googleapis.com/v1/${photoName}/media?key=${process.env.GOOGLE_PLACES_API_KEY}&maxHeightPx=400`;
    } else if (place.photos && place.photos.length > 0) {
      const photoName = place.photos[0].name;
      comp_profile_img = `https://places.googleapis.com/v1/${photoName}/media?key=${process.env.GOOGLE_PLACES_API_KEY}&maxHeightPx=400`;
    }

    // 4️⃣ Check if company already exists
    const existing = await pool.query(
      "SELECT id, slug FROM companies WHERE google_place_id = $1 LIMIT 1",
      [place.id]
    );

    // 5️⃣ Generate slug
    const baseSlug = slugify(place.displayName?.text || "business", {
      lower: true,
      strict: true
    });

    let finalSlug = baseSlug;

    if (existing.rows.length > 0) {
      const existingCompany = existing.rows[0];
      
      if (existingCompany.slug) {
        finalSlug = existingCompany.slug;
      } else {
        const slugCheck = await pool.query(
          "SELECT COUNT(*) FROM companies WHERE slug = $1 AND id != $2",
          [baseSlug, existingCompany.id]
        );
        
        if (parseInt(slugCheck.rows[0].count) > 0) {
          finalSlug = `${baseSlug}-${Date.now()}`;
        }
      }
    } else {
      const slugCheck = await pool.query(
        "SELECT COUNT(*) FROM companies WHERE slug = $1",
        [baseSlug]
      );

      if (parseInt(slugCheck.rows[0].count) > 0) {
        finalSlug = `${baseSlug}-${Date.now()}`;
      }
    }

    // 6️⃣ Prepare place_details object (without reviews to avoid duplication)
    const placeDetailsWithoutReviews = {
      id: place.id,
      displayName: place.displayName,
      formattedAddress: place.formattedAddress,
      location: place.location,
      types: place.types,
      editorialSummary: placeDetails?.editorialSummary || null,
      currentOpeningHours: placeDetails?.currentOpeningHours || null,
      businessStatus: placeDetails?.businessStatus || null,
      detailFetchedAt: new Date().toISOString(),
    };

    // 7️⃣ Start transaction
    await pool.query("BEGIN");

    // 8️⃣ Insert/Update company
    const insertCompanyQuery = `
      INSERT INTO companies (
        name, slug, address, website_link, google_map_link, business_email,
        business_phone_text, avg_rating, rating_count, google_place_id,
        google_user_rating_count, google_rating, latitude, longitude,
        categories, place_details, last_google_fetch, userid, isverified,
        comp_profile_img
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,
        $17,$18,$19,$20
      )
      ON CONFLICT (google_place_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        slug = COALESCE(NULLIF(companies.slug, ''), EXCLUDED.slug),
        address = EXCLUDED.address,
        website_link = EXCLUDED.website_link,
        google_map_link = EXCLUDED.google_map_link,
        avg_rating = EXCLUDED.avg_rating,
        rating_count = EXCLUDED.rating_count,
        google_rating = EXCLUDED.google_rating,
        google_user_rating_count = EXCLUDED.google_user_rating_count,
        business_phone_text = EXCLUDED.business_phone_text,
        place_details = EXCLUDED.place_details,
        last_google_fetch = EXCLUDED.last_google_fetch,
        comp_profile_img = EXCLUDED.comp_profile_img
      RETURNING id, slug, name, address;
    `;

    const values = [
      place.displayName?.text || "Unknown",
      finalSlug,
      place.formattedAddress || null,
      place.websiteUri || null,
      place.googleMapsUri || null,
      null,
      place.internationalPhoneNumber || null,
      place.rating || null,
      place.userRatingCount || null,
      place.id,
      place.userRatingCount || null,
      place.rating || null,
      place.location?.latitude || null,
      place.location?.longitude || null,
      JSON.stringify(place.types || []),
      JSON.stringify(placeDetailsWithoutReviews), // ✅ Now includes detailed info
      new Date().toISOString(),
      null,
      true,
      comp_profile_img
    ];

    const saved = await pool.query(insertCompanyQuery, values);
    const companyId = saved.rows[0].id;

    // 9️⃣ Insert/Update reviews
    let reviewsInserted = 0;
    if (placeDetails?.reviews && Array.isArray(placeDetails.reviews)) {
      const insertReviewQuery = `
        INSERT INTO reviews (
          company_id, google_review_id, text, rating, 
          author_name, author_photo_url, author_profile_url,
          publish_time, google_maps_uri, source, language_code, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (google_review_id) 
        DO UPDATE SET
          text = EXCLUDED.text,
          rating = EXCLUDED.rating,
          author_name = EXCLUDED.author_name,
          author_photo_url = EXCLUDED.author_photo_url,
          publish_time = EXCLUDED.publish_time
        RETURNING id;
      `;

      for (const review of placeDetails.reviews) {
        try {
          const reviewValues = [
            companyId,
            review.name || null,
            review.text?.text || review.originalText?.text || "",
            review.rating || null,
            review.authorAttribution?.displayName || "Anonymous",
            review.authorAttribution?.photoUri || null,
            review.authorAttribution?.uri || null,
            review.publishTime ? new Date(review.publishTime) : null,
            review.googleMapsUri || null,
            "google",
            review.text?.languageCode || review.originalText?.languageCode || "en",
            new Date(),
          ];

          await pool.query(insertReviewQuery, reviewValues);
          reviewsInserted++;
        } catch (reviewError) {
          console.error(`⚠️ Failed to insert review:`, reviewError.message);
        }
      }
    }

    await pool.query("COMMIT");

    // 🔟 Verify slug exists
    const savedCompany = saved.rows[0];
    
    if (!savedCompany || !savedCompany.slug) {
      console.error("❌ ERROR: Slug is NULL after insert/update!", savedCompany);
      throw new Error("Failed to generate company slug");
    }

    console.log("✅ Company stored successfully:", {
      id: savedCompany.id,
      name: savedCompany.name,
      slug: savedCompany.slug,
      reviewsInserted: reviewsInserted
    });

    // ⏹️ Return success with all details
    return res.status(201).json({
      success: true,
      message: "Company stored successfully",
      companyId: savedCompany.id,
      slug: savedCompany.slug,
      name: savedCompany.name,
      reviewsInserted: reviewsInserted,
      hasOpeningHours: !!placeDetails?.currentOpeningHours,
      hasEditorialSummary: !!placeDetails?.editorialSummary,
      businessStatus: placeDetails?.businessStatus || null
    });

  } catch (err) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error("❌ Store Company Error:", err.response?.data || err.message);
    return res.status(500).json({ 
      success: false,
      error: err.message || "Failed to store company" 
    });
  }
};

export const getCompaniesByCategory = async (req, res) => {
  try {
    const { category, categories } = req.query;

    // 🧩 Support either ?category=food or ?categories=food,restaurant
    const categoryList = categories
      ? categories.split(",").map(c => c.trim().toLowerCase())
      : category
        ? [category.trim().toLowerCase()]
        : [];

    if (categoryList.length === 0) {
      return res.status(400).json({ error: "Missing 'category' or 'categories' query parameter." });
    }

    // 🧠 SQL: match if any element in categories array matches any of the filters (case-insensitive)
    const query = `
      SELECT 
        c.id,
        c.name,
        c.address,
        c.website_link,
        c.google_map_link,
        c.categories,
        c.gstin_num,
        c.business_email,
        c.business_phone_text,
        c.social_links,
        c.avg_rating,
        c.rating_count,
        c.google_rating,
        c.google_user_rating_count,
        c.google_place_id,
        c.latitude,
        c.longitude,
        c.place_details,
        c.last_google_fetch,
        c.comp_profile_img,
        c.description,
        c.isverified,
        c.isblocked,
        c.userid,
        c.slug,
        c.created_at,
        c.updated_at,
        u.first_name,
        u.last_name,
        u.email AS user_email
      FROM companies c
      LEFT JOIN users u ON c.userid = u.id
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(c.categories) AS cat
        WHERE LOWER(cat) = ANY ($1)
      )
      ORDER BY c.created_at DESC
    `;

    // 🧩 Send array param directly
    const result = await pool.query(query, [categoryList]);

    // 🧾 Process and format results
    const companiesWithReviews = result.rows.map(company => {
      let reviews = [];
      let reviewSummary = null;
      let businessStatus = null;
      let openingHours = null;

      if (company.place_details) {
        try {
          const details =
            typeof company.place_details === "string"
              ? JSON.parse(company.place_details)
              : company.place_details;

          reviews = details.reviews || [];
          businessStatus = details.businessStatus || null;
          openingHours =
            details.currentOpeningHours || details.openingHours || null;

          if (reviews.length > 0) {
            const ratings = reviews.map(r => r.rating);
            reviewSummary = {
              total: reviews.length,
              averageRating: (
                ratings.reduce((a, b) => a + b, 0) / ratings.length
              ).toFixed(1),
              ratingDistribution: {
                5: reviews.filter(r => r.rating === 5).length,
                4: reviews.filter(r => r.rating === 4).length,
                3: reviews.filter(r => r.rating === 3).length,
                2: reviews.filter(r => r.rating === 2).length,
                1: reviews.filter(r => r.rating === 1).length,
              },
              latestReview:
                reviews[0]?.relativePublishTimeDescription || null,
            };
          }
        } catch (err) {
          console.error(
            `⚠️ Failed to parse place_details for company ${company.id}:`,
            err
          );
        }
      }

      return {
        id: company.id,
        name: company.name,
        address: company.address,
        websiteLink: company.website_link,
        googleMapLink: company.google_map_link,
        categories: company.categories,
        gstinNum: company.gstin_num,
        businessEmail: company.business_email,
        businessPhone: company.business_phone_text,
        socialLinks: company.social_links,
        avgRating: company.avg_rating,
        ratingCount: company.rating_count,
        googleRating: company.google_rating,
        googleUserRatingCount: company.google_user_rating_count,
        googlePlaceId: company.google_place_id,
        latitude: company.latitude,
        longitude: company.longitude,
        profileImage: company.comp_profile_img,
        description: company.description,
        isverified: company.isverified,
        isBlocked: company.isblocked,
        lastGoogleFetch: company.last_google_fetch,
        businessStatus,
        openingHours,
        reviews,
        reviewSummary,
        userId: company.userid,
        slug:company.slug,
        owner: company.userid
          ? {
            firstName: company.first_name,
            lastName: company.last_name,
            email: company.user_email,
          }
          : null,
        createdAt: company.created_at,
        updatedAt: company.updated_at,
      };
    });

    res.status(200).json({
      message: `✅ Companies in categories [${categoryList.join(", ")}] fetched successfully!`,
      count: result.rowCount,
      data: companiesWithReviews,
    });

  } catch (error) {
    console.error("❌ Error filtering companies by category:", error);
    res.status(500).json({
      error: "Internal server error while filtering companies.",
    });
  }
};
               
export const getTopRatedCompanies = async (req, res) => {
  try {
    // Optional query params for pagination
    const { limit = 40, offset = 0 } = req.query;

    // SQL: fetch companies with avg_rating between 4.0 and 5.0
    const query = `
      SELECT 
        c.id,
        c.name,
        c.address,
        c.website_link,
        c.google_map_link,
        c.categories,
        c.gstin_num,
        c.business_email,
        c.business_phone_text,
        c.social_links,
        c.avg_rating,
        c.rating_count,
        c.google_rating,
        c.google_user_rating_count,
        c.google_place_id,
        c.latitude,
        c.longitude,
        c.place_details,
        c.last_google_fetch,
        c.comp_profile_img,
        c.description,
        c.isverified,
        c.isblocked,
        c.userid,
        c.slug,
        c.status,
        c.created_at,
        c.updated_at,
        u.first_name,
        u.last_name,
        u.email AS user_email
      FROM companies c
      LEFT JOIN users u ON c.userid = u.id
      WHERE 
        (
          (c.avg_rating BETWEEN 4.0 AND 5.0)
          OR
          (c.google_rating BETWEEN 4.0 AND 5.0)
        )
        AND c.isblocked = false
      ORDER BY 
        GREATEST(c.created_at, c.updated_at) DESC,
        COALESCE(c.avg_rating, c.google_rating) DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);

    res.status(200).json({
      message: "🏆 Top rated companies fetched successfully (rating 4.0 - 5.0)!",
      count: result.rowCount,
      data: result.rows,
    });

  } catch (error) {
    console.error("❌ Error fetching top rated companies:", error);
    res.status(500).json({ error: "Internal server error while fetching top-rated companies." });
  }
};

export default router;