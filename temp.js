const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("./models/User");
require("dotenv").config();
async function seed() {
    await mongoose.connect(process.env.MONGO_URI);

    const hashedPassword = await bcrypt.hash("bhavya123", 10);

    await User.create({
        name: "Bhavya Natani",
        email: "natanibhavya30@gmail.com",
        password: hashedPassword,
        isVerified: true,
        role: "admin"
    });

    console.log("User inserted");
    process.exit();
}

seed();