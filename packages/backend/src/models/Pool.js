const mongoose = require("mongoose");

const PoolSchema = new mongoose.Schema(
  {
    poolAddress: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    ownerSafeAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    poolName: { type: String, default: null },
    isPublished: { type: Boolean, default: false },
    subscriptionExpiresAt: { type: Date, default: null },
    totalSubscribedMonths: { type: Number, default: 0 },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
); // ← THIS replaces the broken pre-save hook

PoolSchema.virtual("subscriptionActive").get(function () {
  if (!this.subscriptionExpiresAt) return false;
  return new Date() < this.subscriptionExpiresAt;
});

PoolSchema.set("toJSON", { virtuals: true });
PoolSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Pool", PoolSchema);
