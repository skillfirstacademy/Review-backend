import express from "express";
import {
    getAllCompanies,
    addComp,
    deleteComp,
    updateComp,
    getbyIdComp,
    verifyComp,
    getbyUserIdCompany,
    blockComp,
    unblockComp,
    fetchAndStoreCompaniesFromGoogle,
    searchGooglePlaces,
    storeSingleCompany,
    getCompaniesByCategory,
    getTopRatedCompanies,
    getCompanyByName,
    makePremium
    // fetchGooglePlaceDetails
} from "../controllers/companyController.js"; // adjust path if needed
import { upload } from '../middleware/uploads.js';
const router = express.Router();

// GET all companies
router.get("/all", getAllCompanies);
router.get("/profile/:id", getbyIdComp);

router.get("/filter", getCompaniesByCategory);
router.get("/toprated", getTopRatedCompanies);
router.post('/search-places', searchGooglePlaces);
router.get("/:slug", getCompanyByName);
// GET company by ID
router.get('/user/:userId', getbyUserIdCompany);// Added for consistency with other routes

// POST new company
router.post("/register",upload.fields([{name:'comp_profile_img', maxCount:1}]) ,addComp);

// PATCH update company
router.put("/:id", upload.fields([{name:'comp_profile_img', maxCount:1}]) ,updateComp);

// PATCH verify company (admin)
router.put("/:id/verify", verifyComp);
router.put("/:id/makepremium", makePremium);
router.post("/:id/block", blockComp);
router.post("/:id/unblock", unblockComp);

router.post("/fetch-google", fetchAndStoreCompaniesFromGoogle);
router.post('/store-single', storeSingleCompany);
// DELETE company
router.delete("/:id", deleteComp);


export default router;