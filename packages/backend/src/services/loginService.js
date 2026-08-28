import { User } from "../models/Users.js";
import bcrypt from "bcryptjs";

async function login(email, password) {
  const user = await User.findOne({ email });
  if (!user) {
    throw Error("User not found ❌");
  }
  const isMatch = await bcrypt.compare(
    password.trim().toLowerCase(),
    user.password,
  );
  if (!isMatch) {
    throw Error("Invalid credentials ❌");
  }

  return {
    status: true,
    data: {
      username: user.username,
      email: email,
      safeAddress: user.safeAddress,
      isValidator: user.isValidator,
      isSeller: user.isSeller,
      nameAlias: user.nameAlias || null,
    },
  };
}

export default login;
