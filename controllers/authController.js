import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js'; // Import the pool from db.js
import { v4 as uuidv4 } from 'uuid'; 
import nodemailer from "nodemailer";
const baseUrl = process.env.BASE_URL || 'http://localhost:5173';

/* ---------- Normal Email/Password Signup ---------- */
export const signup = async (req, res) => {
  const { firstName, lastName, email, password, address } = req.body;

  try {
    // Validate required fields
    if (!firstName || !email || !password) {
      return res.status(400).json({ error: 'First name, email, and password are required' });
    }

    console.log('Signup request:', { firstName, lastName, email, address });

    // Check if user exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate UUID for id
    const userId = uuidv4();

    // Create new user
    const newUser = await pool.query(
      `INSERT INTO users (id, first_name, last_name, email, password, address, google_auth, status, type, subscription, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, first_name, last_name, email, address, google_auth, status, type, subscription, role`,
      [userId, firstName, lastName || null, email, hashedPassword, address || null, false, 'active', 'normal', 'free','user']
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = newUser.rows[0];

    res.status(201).json({ 
      message: 'User created successfully', 
      user: userWithoutPassword,
      redirectTo: '/login'
    });

  } catch (error) {
    console.error('Signup error details:', error);
    res.status(500).json({ 
      error: 'Something went wrong',
      details: error.message,
      code: error.code
    });
  }
};


/* ---------- Normal Email/Password Login ---------- */
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check if user signed up with Google
    if (user.google_auth && (!user.password || user.password === '')) {
      return res.status(400).json({ 
        error: 'This account was created with Google. Please use Google Sign-In.' 
      });
    }

    // Compare password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Create token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        type: user.type,
        role: user.role,
        profile_picture: user.profile_picture,
        status: user.status,
      },
      process.env.JWT_SECRET,
      { expiresIn: '10h' }
    );

    res.json({ 
      message: 'Login successful', 
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        google_auth: user.google_auth,
        type: user.type,
        role: user.role,
        subscription: user.subscription,
        profile_picture: user.profile_picture,
        status: user.status,
      },
      redirectTo: '/'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Something went wrong',
      details: error.message 
    });
  }
};

/* ----------- Reset paswword --------*/
// export const resetPassword = async (req, res) => {
//   const { email, newPassword } = req.body;

//   try {
//     // Validate required fields
//     if (!email || !newPassword) {
//       return res.status(400).json({ error: 'Email and new password are required' });
//     }

//     // Find user by email
//     const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
//     const user = userResult.rows[0];

//     if (!user) {
//       return res.status(404).json({ error: 'No account found with this email address' });
//     }

//     // Check if user signed up with Google (they shouldn't reset password this way)
//     if (user.google_auth && (!user.password || user.password === '')) {
//       return res.status(400).json({ 
//         error: 'This account was created with Google. Please use Google Sign-In.' 
//       });
//     }

//     // Hash the new password
//     const hashedPassword = await bcrypt.hash(newPassword, 10);

//     // Update password in database
//     await pool.query(
//       'UPDATE users SET password = $1 WHERE email = $2',
//       [hashedPassword, email]
//     );

//     res.status(200).json({ 
//       message: 'Password reset successfully',
//       success: true 
//     });

//   } catch (error) {
//     console.error('Reset password error:', error);
//     res.status(500).json({ 
//       error: 'Something went wrong',
//       details: error.message 
//     });
//   }
// };

/* ---------- Google OAuth Login/Signup ---------- */
const isProd = process.env.NODE_ENV === 'production';
const frontendUrl = isProd 
  ? 'https://corereviews.com'
  : 'http://localhost:5173';
  
export const googleAuthCallback = async (req, res) => {
  try {
    console.log('Google auth callback - req.user:', frontendUrl);
    
    if (!req.user) {
      console.error('No user data received from Passport');
      return res.redirect(`${frontendUrl}/signup?error=no_user_data`);
    }

    const googleUser = req.user;
    const email = googleUser.email;
    
    if (!email) {
      console.error('No email in Google user data');
      return res.redirect(`${frontendUrl}/signup?error=no_email`);
    }

    // Check if user exists
    let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user = userResult.rows[0];

    if (!user) {
      console.log('Creating new user from Google auth');
      
      const firstName = googleUser.firstName || googleUser.displayName?.split(' ')[0] || 'User';
      const lastName = googleUser.lastName || googleUser.displayName?.split(' ').slice(1).join(' ') || '';
      const userId = uuidv4(); // Generate UUID
      
      userResult = await pool.query(
        `INSERT INTO users (id, first_name, last_name, email, password, google_auth, status, type, subscription, role, profile_picture)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, first_name, last_name, email, google_auth, status, type, subscription, role, profile_picture`,
        [
          userId,              
          firstName,           
          lastName,            
          email,               
          '',                  
          true,                
          'active',            
          'normal',            
          'free',              
          'user',              
          googleUser.photo || null  
        ]
      );
      user = userResult.rows[0];
      console.log('New user created:', user.id);
    } else if (!user.google_auth) {
      console.log('Updating existing user with Google auth');
      userResult = await pool.query(
        `UPDATE users SET google_auth = $1, profile_picture = COALESCE(profile_picture, $2) 
         WHERE email = $3 
         RETURNING *`,
        [true, googleUser.photo, email]
      );
      user = userResult.rows[0];
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        type: user.type,
        role: user.role || 'user',
        profilePicture: user.profile_picture,
        google_auth: user.google_auth === true
      },
      process.env.JWT_SECRET,
      { expiresIn: '10h' }
    );

    console.log('Google authentication successful, redirecting with token');
    
    // Redirect to frontend with token
    res.redirect(`${frontendUrl}/signup?token=${token}&google=true&userId=${user.id}&firstName=${encodeURIComponent(user.first_name)}&lastName=${encodeURIComponent(user.last_name)}&email=${encodeURIComponent(user.email)}&role=${user.role}`);
    
  } catch (error) {
    console.error('Google auth error:', {
      message: error.message,
      stack: error.stack
    });
    res.redirect(`${frontendUrl}/signup?error=google_auth_failed`);
  }
};
// Also add the /me endpoint if you don't have it
export const getCurrentUser = async (req, res) => {
  try {
    // req.userId should be set by your auth middleware
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const result = await pool.query(
      'SELECT id, first_name, last_name, email, type, google_auth, role, profile_picture, status, subscription FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    
    res.json({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      type: user.type,
      google_auth: user.google_auth,
      role: user.role,
      profile_picture: user.profile_picture,
      status: user.status,
      subscription: user.subscription
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/* ---------- Helper function to get user profile ---------- */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From JWT middleware
    
    const userResult = await pool.query(
      `SELECT id, first_name, last_name, email, google_auth, status, type, subscription
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
};

/* ---------- Get User By ID ---------- */
import { validate as isUuid } from 'uuid';

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Check for missing or invalid id
    if (!id || id === "null" || id === "undefined" || !isUuid(id)) {
      return res.status(400).json({ error: "Invalid or missing user ID" });
    }

    // 2️⃣ Query only if valid
    const query = `
      SELECT 
        id, 
        first_name AS "firstName", 
        last_name AS "lastName", 
        email, 
        address, 
        google_auth AS "googleAuth", 
        status, 
        type, 
        role,
        subscription, 
        "noOfComp" AS "noOfCompanies", 
        "CompaniesId" AS "companiesId", 
        aadhar_num AS "aadharNum", 
        pan_num AS "panNum", 
        aadhar_img AS "aadharImg", 
        pan_img AS "panImg", 
        profile_picture AS "profilePicture"
      FROM users 
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({ user });

  } catch (error) {
    console.error("Get user by ID error:", error);
    return res.status(500).json({
      error: "Something went wrong while fetching user",
      details: error.message,
    });
  }
};


/* ---------- Get All Users ---------- */
export const getAllUsers = async (req, res) => {
  try {
    const usersResult = await pool.query(
      `SELECT id, first_name, last_name, email, address, google_auth, status, type, role, phone,
              subscription, "noOfComp", "CompaniesId", aadhar_num, pan_num, aadhar_img, pan_img, profile_picture, createdat
       FROM users ORDER BY createdat DESC`
    );

    return res.status(200).json({
      success: true,
      data: usersResult.rows,
    });

    // res.json({ users: usersResult.rows });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Something went wrong', details: error.message });
  }
};

/* ---------- Update User ---------- */
export const updateUser = async (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, email, password,type, address, aadhar_num, pan_num } = req.body;

  console.log('Request Body:', req.body);
  console.log('Request Files:', req.files);

  try {
    // Verify JWT token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    jwt.verify(token, process.env.JWT_SECRET);

    // Validate required fields
    if (!first_name || !email ) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    // Validate field formats
    if (first_name.trim().length < 1) {
      return res.status(400).json({ error: 'First name cannot be empty or only spaces' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if(aadhar_num){
      if (!/^\d{12}$/.test(aadhar_num)) {
        return res.status(400).json({ error: 'Aadhar number must be 12 digits' });
      }
    }
    if(pan_num){
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan_num)) {
        return res.status(400).json({ error: 'Invalid PAN number format' });
      }
    }

    // Check if email is taken by another user
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND id != $2',
      [email, id]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already in use by another account' });
    }

    // Prepare update data
    const updateData = [
      first_name.trim(),
      last_name ? last_name.trim() : null,
      email,
      address || null,
      aadhar_num,
      pan_num,
      type,
      req.files?.aadhar_img ? req.files.aadhar_img[0].filename : null,
      req.files?.pan_img ? req.files.pan_img[0].filename : null,
      req.files?.profile_picture ? req.files.profile_picture[0].filename : null,
      id
    ];

    // Hash password if provided
    let query = `
      UPDATE users 
      SET first_name = $1, last_name = $2, email = $3, address = $4, 
          aadhar_num = $5, pan_num = $6, type = $7, 
          aadhar_img = COALESCE($8, aadhar_img), 
          pan_img = COALESCE($9, pan_img), 
          profile_picture = COALESCE($10, profile_picture)
    `;
    const queryParams = updateData;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = $11';
      queryParams.push(hashedPassword);
    }

    query += ' WHERE id = $' + (queryParams.length) + ' RETURNING id, first_name, last_name, email, address, aadhar_num, pan_num, aadhar_img, pan_img, profile_picture, google_auth, status, type, subscription';

    // Update user
    const updatedUser = await pool.query(query, queryParams);

    res.status(200).json({
      message: 'Business details updated successfully',
      user: updatedUser.rows[0],
    });
  } catch (error) {
    console.error('Update Business Error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already in use' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    res.status(500).json({ error: 'Something went wrong', details: error.message });
  }
};


export const blockUser = async (req, res) => {
  const { id } = req.params;

  try {
    // Update user status to inactive
    const updatedUser = await pool.query(
      `UPDATE users 
       SET status = 'inactive' 
       WHERE id = $1 
       RETURNING id, first_name, last_name, email, address, aadhar_num, pan_num, 
                 aadhar_img, pan_img, profile_picture, google_auth, status, type, subscription`,
      [id]
    );

    if (updatedUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      message: 'User blocked successfully',
      user: updatedUser.rows[0],
    });
  } catch (error) {
    console.error('Block User Error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    res.status(500).json({ error: 'Something went wrong', details: error.message });
  }
};

/* ---------- Check Auth on Load ---------- */
export const checkAuthOnLoad = async (req, res) => {
  try {
    // console.log('getCurrentUser called');
    
    // Extract token from Authorization header
    const authHeader = req.headers['authorization'];
    // console.log('Auth header:', authHeader);
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'unauthorized',
        message: 'No authorization header' 
      });
    }

    const token = authHeader.split(' ')[1]; // Get token from "Bearer TOKEN"
    
    if (!token) {
      return res.status(401).json({ 
        error: 'unauthorized',
        message: 'No token provided' 
      });
    }

    // Verify the JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      // console.log('Token decoded:', decoded);
    } catch (err) {
      console.log('Token verification failed:', err.message);
      return res.status(403).json({ 
        error: 'invalid_token',
        message: 'Invalid or expired token' 
      });
    }

    const userId = decoded.id;
    // console.log('Fetching user with ID:', userId);
    
    // Fetch user from database
    const userResult = await pool.query(
      'SELECT id, first_name, last_name, email, type, role, profile_picture, status, subscription, google_auth FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'no_user_data',
        message: 'User not found' 
      });
    }

    const user = userResult.rows[0];
    // console.log('User found:', user.email);

    // Return user data as JSON
    return res.status(200).json({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      type: user.type,
      role: user.role,
      profile_picture: user.profile_picture,
      status: user.status,
      subscription: user.subscription || 'free',
      google_auth: user.google_auth
    });

  } catch (error) {
    console.error('Error in getCurrentUser:', error);
    return res.status(500).json({ 
      error: 'server_error',
      message: 'Internal server error' 
    });
  }
};

/* ---------- Delete User ---------- */
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Something went wrong', details: error.message });
  }
};

export const makeAdmin = async (req, res) => {
  const { id } = req.params; // user ID to upgrade

  try {
    if (!id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if user exists
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.type === 'admin') {
      return res.status(400).json({ error: 'User is already an admin' });
    }

    // Update user type to 'admin'
    const updateResult = await pool.query(
      `UPDATE users SET type = $1 WHERE id = $2 RETURNING id, first_name, last_name, email, type`,
      ['admin', id]
    );

    res.status(200).json({
      message: 'User promoted to admin successfully',
      user: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Error promoting user to admin:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};



export const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const userQuery = await pool.query(`SELECT * FROM users WHERE email=$1`, [email]);
    const user = userQuery.rows[0];

    if (!user) return res.status(404).json({ error: "No account found with this email" });

    // Prevent reset for Google sign-in only accounts
    if (user.google_auth && (!user.password || user.password === "")) {
      return res.status(400).json({
        error: "This account was created with Google Sign-In. Please continue using Google login."
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 min

    // Store OTP + expiry in DB
    await pool.query(
      `UPDATE users SET reset_otp=$1, reset_otp_expiry=$2 WHERE email=$3`,
      [otp, expiry, email]
    );

    // Send OTP email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.Email,
        pass: process.env.Password,
      },
    });

    await transporter.sendMail({
      to: email,
      subject: "🔐 Password Reset Code",
      html: `
        <h2>Your Password Reset OTP</h2>
        <p>Use the code below to reset your password:</p>
        <h1 style="font-size:32px; letter-spacing:5px;">${otp}</h1>
        <p>This OTP expires in <strong>10 minutes</strong>.</p>
      `,
    });

    return res.json({ message: "OTP sent successfully" });

  } catch (err) {
    console.error("Error sending reset OTP:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
};

export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return res.status(400).json({ error: "Email and OTP are required" });

  try {
    const userQuery = await pool.query(
      `SELECT reset_otp, reset_otp_expiry FROM users WHERE email=$1`,
      [email]
    );

    const user = userQuery.rows[0];
    if (!user) return res.status(404).json({ error: "Invalid email" });

    // Check OTP match
    if (user.reset_otp !== otp)
      return res.status(400).json({ error: "Invalid OTP" });

    // Check expiration
    if (new Date() > new Date(user.reset_otp_expiry))
      return res.status(400).json({ error: "OTP expired" });

    return res.json({ message: "OTP verified successfully" });

  } catch (err) {
    console.error("OTP verification error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
};


export const resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword)
    return res.status(400).json({ error: "Email and new password are required" });

  try {
    const userQuery = await pool.query(`SELECT * FROM users WHERE email=$1`, [email]);
    const user = userQuery.rows[0];

    if (!user) return res.status(404).json({ error: "No user found" });

    // Prevent reset for Google OAuth only accounts
    if (user.google_auth && (!user.password || user.password === "")) {
      return res.status(400).json({
        error: "This account uses Google Sign-In — password reset not allowed."
      });
    }

    // Ensure OTP is verified — safeguard (optional but recommended)
    if (!user.reset_otp || !user.reset_otp_expiry) {
      return res.status(400).json({ error: "OTP verification required before reset" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users SET password=$1, reset_otp=NULL, reset_otp_expiry=NULL WHERE email=$2`,
      [hashedPassword, email]
    );

    return res.json({ message: "Password reset successfully ✔" });

  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};