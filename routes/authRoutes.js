// authRoutes.js
import express from 'express';
import passport from 'passport';
import { upload } from '../middleware/uploads.js';
import { 
  signup, 
  login, 
  resetPassword,
  makeAdmin, 
  googleAuthCallback, 
  getUserById, 
  getAllUsers, 
  updateUser, 
  blockUser, 
  checkAuthOnLoad, 
  deleteUser,
  requestPasswordReset,
  verifyOtp
} from '../controllers/authController.js';

const router = express.Router();

// ---------- Regular Auth Routes ----------
router.post('/signup', signup);
router.post('/login', login);
// router.post('/reset-password', resetPassword);
router.post("/request-reset", requestPasswordReset);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

router.get('/users', getAllUsers);
router.get('/me', checkAuthOnLoad);
router.get('/users/:id', getUserById);
router.put('/users/:id', upload.fields([
    { name: 'aadhar_img', maxCount: 1 },
    { name: 'pan_img', maxCount: 1 },
    { name: 'profile_picture', maxCount: 1 },
]), updateUser);
router.put('/block/:id', blockUser);
router.delete('/:id', deleteUser);
router.put('/users/:id/make-admin', makeAdmin);

// ---------- Google OAuth Routes ----------
router.get('/google', passport.authenticate('google', { 
  scope: ['profile', 'email'] 
}));



const isProd = process.env.NODE_ENV === 'production';
const frontendUrl = process.env.FRONTEND_URL || (isProd 
  ? 'https://corereviews.com'
  : 'http://localhost:5173');

router.get(
  '/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${frontendUrl || 'http://localhost:5173'}/signup?error=auth_failed`,
    session: false 
  }),
  googleAuthCallback
);

export default router;