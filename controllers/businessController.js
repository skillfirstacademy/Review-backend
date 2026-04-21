import bcrypt from 'bcrypt';
import pool from '../config/db.js'; // Import the pool from db.js
import { v4 as uuidv4 } from 'uuid';
import nodemailer from "nodemailer";

// const BASE_URL = process.env.BASE_URL;

const isProd = process.env.NODE_ENV === 'production';
const BASE_URL = process.env.FRONTEND_URL || (isProd
  ? 'https://corereviews.com'
  : 'http://localhost:5173');

// Add Business (for new signup)
export const signupBusiness = async (req, res) => {
  const { first_name, last_name, email, password, address, aadhar_num, pan_num } = req.body;

  console.log("Request Body:", req.body);
  console.log("Request Files:", req.files);

  try {
    // Validate required fields
    if (!first_name || !email || !password || !aadhar_num || !pan_num) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    // Validate field formats
    if (first_name.trim().length < 1) {
      return res.status(400).json({ error: 'First name cannot be empty or only spaces' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!/^\d{12}$/.test(aadhar_num)) {
      return res.status(400).json({ error: 'Aadhar number must be 12 digits' });
    }
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan_num)) {
      return res.status(400).json({ error: 'Invalid PAN number format' });
    }

    // Check for existing user
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    // Create new user
    const newUser = await pool.query(
      `INSERT INTO users (
        id, first_name, last_name, email, password, address, google_auth, status, type, subscription,
        aadhar_num, pan_num, aadhar_img, pan_img, profile_picture, role
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, first_name, last_name, email, address, google_auth, status, type, subscription,
      aadhar_num, pan_num, aadhar_img, pan_img, profile_picture, role`,
      [
        userId,
        first_name.trim(),
        last_name ? last_name.trim() : null,
        email,
        hashedPassword,
        address || null,
        false,
        "active",
        "business",
        "free",
        aadhar_num,
        pan_num,
        req.files?.aadhar_img ? req.files.aadhar_img[0].filename : null,
        req.files?.pan_img ? req.files.pan_img[0].filename : null,
        req.files?.profile_picture ? req.files.profile_picture[0].filename : null,
        'user'
      ]
    );



    // Exclude password from response
    const { password: _, ...userWithoutPassword } = newUser.rows[0];

    res.status(201).json({
      message: 'Business account created successfully',
      user: userWithoutPassword,
      redirectTo: '/login',
    });
  } catch (error) {
    console.error('Business Signup Error:', error);
    res.status(500).json({ error: 'Something went wrong', details: error.message });
  }
};

// Convert existing user to business
export const upgradeToBusiness = async (req, res) => {
  const { email, password, aadharNum, panNum } = req.body;

  try {
    // Find user by email
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update user to business
    const updatedUser = await pool.query(
      `UPDATE users 
       SET type = $1, aadhar_num = $2, pan_num = $3, 
           aadhar_img = COALESCE($4, aadhar_img), 
           pan_img = COALESCE($5, pan_img), 
           profile_picture = COALESCE($6, profile_picture)
       WHERE email = $7
       RETURNING id, first_name, last_name, email, address, google_auth, status, type, subscription, aadhar_num, pan_num, aadhar_img, pan_img, profile_picture`,
      [
        'business',
        aadharNum,
        panNum,
        req.files?.aadharImg ? req.files.aadharImg[0].filename : user.aadhar_img,
        req.files?.panImg ? req.files.panImg[0].filename : user.pan_img,
        req.files?.profileImg ? req.files.profileImg[0].filename : user.profile_picture,
        email
      ]
    );

    const { password: _, ...userWithoutPassword } = updatedUser.rows[0];

    res.status(200).json({
      message: 'Upgraded to Business account successfully',
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Upgrade Error:', error);
    res.status(500).json({ error: 'Something went wrong', details: error.message });
  }
};

export const sendClaimLink = async (req, res) => {
  const { email, companyId } = req.body;

  if (!email || !companyId) {
    return res.status(400).json({
      message: "Email and Company ID are required.",
    });
  }

  try {
    // Create link that owner will open
    // This route/page you will handle in frontend
    const claimLink = `${BASE_URL}/claim-business?companyId=${companyId}`;

    // Email transport (use Gmail App Password)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: `${process.env.Email}`, // Your gmail address
        pass: `${process.env.Password}`, // IMPORTANT
      },
    });

    const mailOptions = {
      from: "Receptive Solutions <corereviews.global@gmail.com>",
      to: email,
      subject: "Claim Your Business - Verification Required",
      html: `
        <h2>Claim Your Business on Receptive Solutions</h2>

        <p>You have been invited to verify ownership of your business.</p>

        <p>Please click the link below to start your business claim process:</p>

        <a href="${claimLink}" 
           style="background:#fbbf24;padding:10px 15px;border-radius:6px;
                  text-decoration:none;color:#000;font-weight:bold;"
           target="_blank">
          Verify & Claim Business
        </a>

        <br/><br/>
        <p>If you did not request this, please ignore this email.</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      message: "Claim link sent successfully to owner.",
      claimLink,
    });

  } catch (error) {
    console.error("❌ Error sending claim email:", error);
    return res.status(500).json({
      message: "Could not send claim email.",
    });
  }
};

export const submitClaimDetails = async (req, res) => {
  try {
    const {
      companyId,
      ownerName,
      email,
      phone,
      gstinNumber,
      panNumber,
      aadharNumber,
      userId,
    } = req.body;

    // ---- Debug incoming values and lengths ----
    console.log("📩 Incoming Data Lengths:", {
      companyId: companyId?.length,
      ownerName: ownerName?.length,
      email: email?.length,
      phone: phone?.length,
      gstinNumber: gstinNumber?.length,
      panNumber: panNumber?.length,
      aadharNumber: aadharNumber?.length,
      userId: userId?.length,
      files: {
        panImg: req.files?.panImg?.[0]?.filename?.length,
        aadharImg: req.files?.aadharImg?.[0]?.filename?.length,
        gstinImg: req.files?.gstinImg?.[0]?.filename?.length
      }
    });

    // ---- Validate required fields ----
    if (!companyId || !ownerName || !email || !phone || !panNumber || !aadharNumber || !userId) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields including userId."
      });
    }

    // ---- DB column safe limits (match your postgres schema) ----
    const limits = {
      companyId: 100,
      ownerName: 100,
      email: 100,
      phone: 100,
      gstinNumber: 100,
      panNumber: 100,
      aadharNumber: 100,
      userId: 100,
      fileName: 200, // fallback for uploaded name
    };

    // ---- Check lengths before insert ----
    const exceedingFields = [];

    if (companyId.length > limits.companyId) exceedingFields.push(`companyId (max ${limits.companyId})`);
    if (ownerName.length > limits.ownerName) exceedingFields.push(`ownerName (max ${limits.ownerName})`);
    if (email.length > limits.email) exceedingFields.push(`email (max ${limits.email})`);
    if (phone.length > limits.phone) exceedingFields.push(`phone (max ${limits.phone})`);
    if (gstinNumber && gstinNumber.length > limits.gstinNumber) exceedingFields.push(`gstinNumber (max ${limits.gstinNumber})`);
    if (panNumber.length > limits.panNumber) exceedingFields.push(`panNumber (max ${limits.panNumber})`);
    if (aadharNumber.length > limits.aadharNumber) exceedingFields.push(`aadharNumber (max ${limits.aadharNumber})`);
    if (userId.length > limits.userId) exceedingFields.push(`userId (max ${limits.userId})`);

    // ---- File lengths ----
    const panImg = req.files?.panImg?.[0]?.filename || null;
    const aadharImg = req.files?.aadharImg?.[0]?.filename || null;
    const gstinImg = req.files?.gstinImg?.[0]?.filename || null;

    if (panImg && panImg.length > limits.fileName) exceedingFields.push(`PAN Image filename (max ${limits.fileName})`);
    if (aadharImg && aadharImg.length > limits.fileName) exceedingFields.push(`Aadhar Image filename (max ${limits.fileName})`);
    if (gstinImg && gstinImg.length > limits.fileName) exceedingFields.push(`GSTIN Image filename (max ${limits.fileName})`);

    // ---- Stop request if invalid ----
    if (exceedingFields.length > 0) {
      console.warn("❌ Length validation failed:", exceedingFields);
      return res.status(400).json({
        success: false,
        message: `Some fields exceed allowed length: ${exceedingFields.join(", ")}`,
      });
    }

    // ---- Check if company already applied ----
    const existing = await pool.query(
      `SELECT id FROM business_claim_submissions WHERE company_id = $1`,
      [companyId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This company already has a pending verification request."
      });
    }

    // ---- Insert into DB ----
    const query = `
      INSERT INTO business_claim_submissions (
        company_id, owner_name, email, phone,
        gstin_number, pan_number, aadhar_number,
        pan_img, aadhar_img, gstin_img, user_id   
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      companyId,
      ownerName,
      email,
      phone,
      gstinNumber || null,
      panNumber,
      aadharNumber,
      panImg,
      aadharImg,
      gstinImg,
      userId
    ];

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      message: "Claim details submitted successfully!",
      data: result.rows[0]
    });

  } catch (err) {
    console.error("❌ Error submitClaimDetails:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      details: err.message
    });
  }
};


export const getAllClaimSubmissions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM business_claim_submissions ORDER BY created_at DESC`
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("❌ Error getAllClaimSubmissions:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

export const approveClaimSubmission = async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();

  try {
    // 1️⃣ Find the claim
    const claimRes = await client.query(
      `SELECT * FROM business_claim_submissions WHERE id = $1`,
      [id]
    );

    if (claimRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Claim not found.",
      });
    }

    const claim = claimRes.rows[0];

    const {
      user_id,
      company_id,
      email,
      phone,
      gstin_number,
      gstin_img,
      pan_number,
      pan_img,
      aadhar_number,
      aadhar_img
    } = claim;

    // Start transaction
    await client.query("BEGIN");

    // 2️⃣ Update COMPANY TABLE (only business + gst fields)
    await client.query(
      `
      UPDATE companies
      SET 
        userid = $1,
        isowned = true,
        business_email = $2,
        business_phone_text = $3,
        gstin_num = $4,
        gstin_img = $5
      WHERE id = $6
      `,
      [
        user_id,
        email,
        phone,
        gstin_number,
        gstin_img,
        company_id
      ]
    );

    // 3️⃣ Update USER TABLE (only KYC fields)
    await client.query(
      `
      UPDATE users
      SET
        "CompaniesId" = $1,
        pan_num = $2,
        pan_img = $3,
        aadhar_num = $4,
        aadhar_img = $5
      WHERE id = $6
      `,
      [
        company_id,
        pan_number,
        pan_img,
        aadhar_number,
        aadhar_img,
        user_id
      ]
    );

    // 4️⃣ Update claim status
    await client.query(
      `UPDATE business_claim_submissions SET status = 'approved' WHERE id = $1`,
      [id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Business claim approved successfully!"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error approveClaimSubmission:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      details: err.message
    });
  } finally {
    client.release();
  }
};

export const rejectClaimSubmission = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE business_claim_submissions
       SET status = 'rejected'
       WHERE id = $1`,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "Claim rejected.",
    });
  } catch (err) {
    console.error("❌ Error rejectClaimSubmission:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};
