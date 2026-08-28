import mongoose from "mongoose";
import { baseConnection } from "../DB_connection.js";

const RateSchema = new mongoose.Schema({
  rate: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
});

const Rate = baseConnection.model("Rate", RateSchema);
export default Rate;
