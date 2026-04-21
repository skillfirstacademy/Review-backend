 import pool from '../config/db.js';
 import { upload } from '../middleware/uploads.js';
 import slugify from "slugify";

import express from 'express';


const router = express.Router();

export const createBlog = async (req, res) => {
  try {
    // Multer stores text fields in req.body
    const { userId, title, content, images = [] } = req.body;

    // Multer stores uploaded file in req.file
    const file = req.file;
    const coverImage = file ? file.filename : null; // store filename or URL

    if (!userId || !title || !content) {
      return res.status(400).json({
        error: "Missing required fields: userId, title, or content",
      });
    }

    // Generate slug
    const slug = slugify(title, { lower: true, strict: true });

    const query = `
      INSERT INTO blogs (user_id, title, slug, content, cover_image, images, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())  
      RETURNING *;
    `;

    const values = [userId, title, slug, content, coverImage, images];

    const result = await pool.query(query, values);

    return res.status(201).json({
      message: "Blog created successfully",
      blog: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error creating blog:", error);
    return res.status(500).json({
      error: "Internal server error while creating blog",
    });
  }
};

export const getBlogs = async (req, res) => {
  try {
    const query = `SELECT * FROM blogs ORDER BY created_at DESC;`;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get blog by ID
export const getBlogById = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `SELECT * FROM blogs WHERE id = $1;`;
    const values = [id];

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Blog not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching blog by ID:", error);
    res.status(500).json({ error: "Server error" });
  }
};


export const deleteBlog = async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body; // optional: to verify the user deleting it

  if (!id) {
    return res.status(400).json({ error: "Blog ID is required" });
  }

  try {
    // ✅ Optional: Ownership verification
    if (userId) {
      const checkQuery = `SELECT * FROM blogs WHERE id = $1 AND user_id = $2;`;
      const checkResult = await pool.query(checkQuery, [id, userId]);
      if (checkResult.rowCount === 0) {
        return res.status(403).json({ error: "Unauthorized: You cannot delete this blog" });
      }
    }

    // ✅ Delete the blog and return it
    const deleteQuery = `DELETE FROM blogs WHERE id = $1 RETURNING *;`;
    const result = await pool.query(deleteQuery, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Blog not found" });
    }

    return res.status(200).json({
      message: "Blog deleted successfully",
      blog: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error deleting blog:", error);
    return res.status(500).json({ error: "Server error while deleting blog" });
  }
};

export const editBlog = async (req, res) => {
  const { id } = req.params;
  const { title, content, images = [], userId } = req.body; // include userId
  const file = req.file;
  const coverImage = file ? file.filename : req.body.coverImage;

  if (!id) return res.status(400).json({ error: "Blog ID is required" });
  if (!userId) return res.status(400).json({ error: "User ID is required" });

  try {
    // Check if the user is the creator
    const checkQuery = `SELECT user_id FROM blogs WHERE id = $1`;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rowCount === 0)
      return res.status(404).json({ error: "Blog not found" });

    if (checkResult.rows[0].user_id !== userId)
      return res.status(403).json({ error: "You are not authorized to edit this blog" });

    // Generate new slug if title changed
    const slug = title ? slugify(title, { lower: true, strict: true }) : null;

    const updateQuery = `
      UPDATE blogs
      SET 
        title = COALESCE($1, title),
        slug = COALESCE($2, slug),
        content = COALESCE($3, content),
        cover_image = COALESCE($4, cover_image),
        images = COALESCE($5, images),
        updated_at = NOW()
      WHERE id = $6 AND user_id = $7
      RETURNING *;
    `;

    const values = [title, slug, content, coverImage, images, id, userId];
    const result = await pool.query(updateQuery, values);

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Blog not found or unauthorized" });

    return res.status(200).json({
      message: "Blog updated successfully",
      blog: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error updating blog:", error);
    return res.status(500).json({ error: "Server error while updating blog" });
  }
};



export default router;