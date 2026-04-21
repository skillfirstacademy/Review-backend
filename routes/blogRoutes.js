// routes/blogRoutes.js
import express from "express";
import { createBlog, getBlogs, deleteBlog, editBlog, getBlogById } from "../controllers/blogController.js";
import { upload } from "../middleware/uploads.js";

const router = express.Router();

router.post("/", upload.single("coverImage"), createBlog);
router.put("/blogs/:id", upload.single("coverImage"), editBlog); // ✅ multer added here
router.get("/blogs", getBlogs);
router.get("/blogs/:id", getBlogById);
router.delete("/blogs/:id", deleteBlog);

export default router;
