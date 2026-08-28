import mongoose from "mongoose";
import { User } from "../models/Users.js";
const OLD_URL = () => {
  return "mongodb://salva_db_user:salva2025@ac-8hzccpx-shard-00-00.hpiuhif.mongodb.net:27017,ac-8hzccpx-shard-00-01.hpiuhif.mongodb.net:27017,ac-8hzccpx-shard-00-02.hpiuhif.mongodb.net:27017/?ssl=true&replicaSet=atlas-p7g64h-shard-0&authSource=admin&appName=salva-nexus&retryWrites=true&w=majority";
};

const NEW_URL = () => {
  return "mongodb://salva_db_user:salva2025@ac-8hzccpx-shard-00-00.hpiuhif.mongodb.net:27017,ac-8hzccpx-shard-00-01.hpiuhif.mongodb.net:27017,ac-8hzccpx-shard-00-02.hpiuhif.mongodb.net:27017/UsersBase?ssl=true&replicaSet=atlas-p7g64h-shard-0&authSource=admin&appName=salva-nexus&retryWrites=true&w=majority";
};

await mongoose.connect(OLD_URL());

const WalletRegistrySchema = new mongoose.Schema({
  name: { type: String, required: true },
  nspace: { type: String, default: '' }, // e.g. "@coinbase"
  registryAddress: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
  },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const WalletRegistry = mongoose.model("WalletRegistry", WalletRegistrySchema);


const oldUsers = await WalletRegistry.find({});
console.log(oldUsers.length)

await mongoose.disconnect();

await mongoose.connect(NEW_URL());


const WalletRegistrySchema2 = new mongoose.Schema({
  name: { type: String, required: true },
  nspace: { type: String, default: "" }, // e.g. "@coinbase"
  registryAddress: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
  },
  description: { type: String, default: "" },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const WalletRegistry2 = mongoose.model("WalletRegistries", WalletRegistrySchema2);

oldUsers.forEach(async (o) => {
  await WalletRegistry2.create({
    name: o.name,
    nspace: o.nspace,
    registryAddress: o.registryAddress,
    safeAddress: o.safeAddress,
  });
});

