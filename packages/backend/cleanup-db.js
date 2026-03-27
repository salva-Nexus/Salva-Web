// const mongoose = require("mongoose"); // <--- MISSING IMPORT
// const path = require("path");
// require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// async function clean() {
//   try {
//     const uri = process.env.MONGODB_URI;

//     if (!uri) {
//       throw new Error("MONGODB_URI is undefined. Check your .env file path.");
//     }

//     await mongoose.connect(uri);
//     console.log("Connected to MongoDB...");

//     const collection = mongoose.connection.collection("users");

//     // Drop the ghost index
//     await collection.dropIndex("accountNumber_1");

//     console.log("✅ Successfully dropped 'accountNumber_1' index.");
//   } catch (err) {
//     if (err.code === 27 || err.message.includes("not found")) {
//       console.log("ℹ️ Index not found—it might have been deleted already.");
//     } else {
//       console.error("❌ Error:", err.message);
//     }
//   } finally {
//     await mongoose.disconnect();
//     process.exit();
//   }
// }

// clean();
