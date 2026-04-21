import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import pool from "./db.js";

console.log('Google OAuth Config:');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '***exists***' : 'MISSING!');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '***exists***' : 'MISSING!');

const baseUrl = process.env.BASE_URL || "http://localhost:5000";

console.log('OAuth Callback URL:', `${baseUrl}/auth/google/callback`);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${baseUrl}/auth/google/callback`,
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google profile received:', {
          id: profile.id,
          displayName: profile.displayName,
          email: profile.emails?.[0]?.value,
          photo: profile.photos?.[0]?.value
        });

        // Extract essential data
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error("No email found in Google profile"));
        }

        // Prepare user data for your application
        const userData = {
          googleId: profile.id,
          displayName: profile.displayName,
          email: email,
          firstName: profile.name?.givenName || profile.displayName.split(' ')[0],
          lastName: profile.name?.familyName || profile.displayName.split(' ').slice(1).join(' ') || '',
          photo: profile.photos?.[0]?.value,
          
        };

        console.log('Sending userData to controller:', userData);

        done(null, userData);
      } catch (error) {
        console.error('Passport Google strategy error:', error);
        done(error);
      }
    }
  )
);

// Serialization - keep minimal
passport.serializeUser((user, done) => {
  console.log('Serializing user:', user);
  done(null, {
    id: user.googleId || user.id,
    email: user.email,
    displayName: user.displayName,
    photo: user.photo
  });
});

passport.deserializeUser((obj, done) => {
  console.log('Deserializing user:', obj);
  done(null, obj);
});

export default passport;



