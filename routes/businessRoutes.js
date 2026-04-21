import express from 'express';
import { upload } from '../middleware/uploads.js';
import { signupBusiness, upgradeToBusiness, sendClaimLink, submitClaimDetails, getAllClaimSubmissions,  approveClaimSubmission, rejectClaimSubmission,} from '../controllers/businessController.js';

const router = express.Router();

// For new user signing up as business
router.post(
  '/signup-business',
  upload.fields([
    { name: 'aadhar_img', maxCount: 1 },
    { name: 'pan_img', maxCount: 1 },
    { name: 'profile_picture', maxCount: 1 },
  ]),
  signupBusiness
);

// For upgrading existing user to business
router.post(
  '/upgrade-business',
  upload.fields([
    { name: 'aadhar_img', maxCount: 1 },
    { name: 'pan_img', maxCount: 1 },
    { name: 'profile_picture', maxCount: 1 },
  ]),
  upgradeToBusiness
);

router.post("/send-link", sendClaimLink);

router.post(
  "/submit-details",
  upload.fields([
    { name: "panImg", maxCount: 1 },
    { name: "aadharImg", maxCount: 1 },
    { name: "gstinImg", maxCount: 1 },
  ]),
  submitClaimDetails
);

router.get("/all", getAllClaimSubmissions); 
router.post("/approve/:id", approveClaimSubmission);
router.post("/reject/:id", rejectClaimSubmission);

export default router;
