// packages/backend/src/scripts/sync_models.js
// Run: node src/scripts/sync_models.js
// Reads every Mongoose model, finds fields with defaults that are missing
// from existing documents, and sets them. Safe to run multiple times.

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

// Load all models
const modelsDir = path.resolve(__dirname, "../models");
const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith(".js"));

console.log(`📦 Loading models from ${modelsDir}...`);
for (const file of modelFiles) {
  try {
    require(path.join(modelsDir, file));
    console.log(`  ✅ ${file}`);
  } catch (e) {
    console.log(`  ⚠️ ${file} skipped: ${e.message}`);
  }
}

async function getDefaultValue(schemaType) {
  if (schemaType.defaultValue === undefined) return undefined;
  const d = schemaType.defaultValue;
  if (typeof d === "function") {
    // Skip Date.now and other dynamic defaults — not safe to backfill
    if (d === Date.now || d.toString().includes("Date.now")) return undefined;
    try { return d(); } catch { return undefined; }
  }
  return d;
}

async function syncModel(model) {
  const schema = model.schema;
  const modelName = model.modelName;
  const setPatch = {};

  // Walk all schema paths and collect those with static defaults
  schema.eachPath((pathName, schemaType) => {
    // Skip internals
    if (pathName === "__v" || pathName === "_id") return;
    // Skip nested/array paths — only top-level scalars
    if (pathName.includes(".")) return;
    // Skip arrays
    if (schemaType instanceof mongoose.Schema.Types.Array) return;

    const defaultVal = schemaType.defaultValue;
    if (defaultVal === undefined) return;
    if (typeof defaultVal === "function") {
      if (defaultVal === Date.now || defaultVal.toString().includes("Date.now")) return;
    }

    let resolvedDefault;
    try {
      resolvedDefault = typeof defaultVal === "function" ? defaultVal() : defaultVal;
    } catch {
      return;
    }

    // null, false, 0, "", [] are all valid defaults worth backfilling
    if (resolvedDefault === undefined) return;

    setPatch[pathName] = resolvedDefault;
  });

  if (Object.keys(setPatch).length === 0) {
    console.log(`  ⏭️  ${modelName}: no defaults to sync`);
    return;
  }

  // For each field, only update docs where that field is missing ($exists: false)
  let totalUpdated = 0;
  for (const [field, defaultVal] of Object.entries(setPatch)) {
    try {
      const result = await model.updateMany(
        { [field]: { $exists: false } },
        { $set: { [field]: defaultVal } },
      );
      if (result.modifiedCount > 0) {
        console.log(`  🔧 ${modelName}.${field}: backfilled ${result.modifiedCount} docs (default=${JSON.stringify(defaultVal)})`);
        totalUpdated += result.modifiedCount;
      }
    } catch (e) {
      console.log(`  ⚠️  ${modelName}.${field}: ${e.message}`);
    }
  }

  if (totalUpdated === 0) {
    console.log(`  ✅ ${modelName}: all docs already up to date`);
  }
}

async function main() {
  console.log("\n🍃 Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log("✅ Connected\n");

  const models = Object.values(mongoose.models);
  console.log(`🔄 Syncing ${models.length} models...\n`);

  for (const model of models) {
    console.log(`📋 ${model.modelName}`);
    await syncModel(model);
  }

  const totalDocs = await Promise.all(
    models.map(m => m.countDocuments().catch(() => 0))
  );
  console.log(`\n📊 Done. Collections: ${models.map((m, i) => `${m.modelName}(${totalDocs[i]})`).join(", ")}`);

  await mongoose.disconnect();
  console.log("👋 Disconnected");
}

main().catch(err => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});

// node src/scripts/sync_models.js