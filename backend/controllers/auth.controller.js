import { User } from "../models/user.model.js";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { generateTokenAndSetCookie } from "../utils/generateTokenAndSetCookie.js";
import { 
	sendPasswordResetEmail,
	sendVerificationEmail,
    sendResetSuccessEmail,
	sendWelcomeEmail,
} from "../mailtrap/email.js";

export const signup = async (req, res) => {
    const { email, password, name, role } = req.body;
    console.log({ email: email, password: password, name: name, role: role});
    try {
        if (!email || !password || !name || !role) {
            throw new Error("All fields are required");
        }
        

        const userAlreadyExists = await User.findOne({ email });
        console.log("userAlreadyExists", userAlreadyExists);

        if (userAlreadyExists) {
            return res.status(400).json({ success: false, message: "User already exists" });
        }

        const hashedPassword = await bcryptjs.hash(password, 10);
        const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

        const user = new User({
            email,
            password: hashedPassword,
            name,
            role,
            verificationToken,
            verificationTokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24hrs
        });

        await user.save();

        generateTokenAndSetCookie(res, user._id);

        await sendVerificationEmail(user.email, verificationToken);


        res.status(201).json({ 
            success: true, 
            message: "User registered successfully",
            user: {
                ...user._doc,
                password: undefined, // Remove the password from the returned user object
            } 
        });

    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

export const verifyEmail =async (req, res) => {
    const {code} = req.body;
    try{
        const user = await User.findOne({
            verificationToken: code,
            verificationTokenExpiresAt: { $gt: Date.now() }
        })
     
        if(user==null || user == undefined){
            return res.status(400).json({ success: false, message: "Invalid or expired verification code" });
        }
        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpiresAt = undefined;
        await user.save();  
        
        await sendWelcomeEmail(user.email,user.name);

        res.status(200).json({ 
            success: true, 
            message: "Email verified successfully",
            user:{
                ...user._doc,
                password:undefined,
            } 
        });
    }catch (error) {
        console.error("Error verifying email:", error);
        return res.status(500).json({ success: false, message: "Something went wrong. Please try again later." });
 
    };
};

export const login = async (req, res) => {
    const {email, password} =req.body;
    try{
        const user = await User.findOne({email});
        if(!user){
            return res.status(400).json({ success: false, message: "User not found or not verified"});
        }
        const isPasswordValid= await bcryptjs.compare(password, user.password);
        if(!isPasswordValid){
            return res.status(400).json({ success: false, message: "Invalid credentials"});
        }
        generateTokenAndSetCookie(res, user._id);
        user.lastLogin=new Date();
        await user.save();

        res.status(200).json({
            success: true,
            message: "Logged in successfully",
            user:{
                ...user._doc,
                password: undefined,
            },
        });

        
    }catch(error){
        console.error("Error logging in:", error);
        res.status(400).json({ success: false, message: "Something went wrong. Please try again later." });
    }
};

export const logout = async (req, res) => {
    res.clearCookie("token");
    res.status(200).json({success: true, message: "logged out"});
};

export const forgotPassword = async (req, res) => {
    const {email} = req.body;
    try{
        const user = await User.findOne({email});
        if(!user){
            return res.status(400).json({ success: false, message: "User not found"});
        }

        const resetToken=crypto.randomBytes(20).toString("hex");
        const resetTokenExpiresAt = Date.now() + 1 * 60 * 60 * 1000; //1 hour

        user.resetPasswordToken=resetToken;
        user.resetPasswordExpiresAt=resetTokenExpiresAt;

        await user.save();

        await sendPasswordResetEmail(user.email, `${process.env.CLIENT_URL}/reset-password/${resetToken}`);
        
        res.status(200).json({ success: true, message: "Reset password link sent to your email"});
    }
    catch(error){
        console.log("Error in forgot password:", error);
        res.status(400).json({ success: false, message: "Something went wrong. Please try again later." });
    }
}

export const resetPassword = async (req, res) => {
	try {
		const { token } = req.params;
		const { password } = req.body;

		const user = await User.findOne({
			resetPasswordToken: token,
			resetPasswordExpiresAt: { $gt: Date.now() },
		});

		if (!user) {
			return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
		}

		// update password
		const hashedPassword = await bcryptjs.hash(password, 10);

		user.password = hashedPassword;
		user.resetPasswordToken = undefined;
		user.resetPasswordExpiresAt = undefined;
		await user.save();

		await sendResetSuccessEmail(user.email);

		res.status(200).json({ success: true, message: "Password reset successful" });
	} catch (error) {
		console.log("Error in resetPassword ", error);
		res.status(400).json({ success: false, message: error.message });
	}
};

export const checkAuth = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-password");
        if (!user) {
            return res.status(401).json({ success: false, message: "user not found" });
        }
        res.status(200).json({ success: true, user});
    } catch (error) {
        console.error("Error in checkAuth:", error);
        res.status(400).json({ success: false, message: "error.message" });
    }
};

export const getUserRole = async (req, res) => {
    try {
   
      const user = await User.findById(req.userId).select('role');
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      res.status(200).json({ role: user.role });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  };
  