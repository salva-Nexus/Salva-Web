import WalletRegistry from "../models/WalletRegistry.js";
import express from "express";

const router = express.Router();

router.post("/new", async (req, res) => {
  try {
    const registries = await WalletRegistry.create(req.body);
    res.status(200).json({
      status: true,
    });
  } catch (err) {
    console.error(`❌ Registry Error`);
    res.status(500).json({
      errorMsg: `❌  Registry Error`,
    });
  }
});

router.get("/registries", async (req, res) => {
  try {
    const registries = await WalletRegistry.find({
      active: true,
    });
    res.status(200).json(registries);
  } catch (err) {
    console.error(`❌ Fetch Registry Error`);
    res.status(500).json({
      errorMsg: `❌ Fetch Registry Error`,
    });
  }
});



router.get("/findByName/:input", async (req, res) => {
  try {
    const input = req.params.input;
    const registry = await WalletRegistry.findOne({
      name: input,
    });
    res.status(200).json(registry);
  } catch (err) {
    console.error(`❌ Fetch Registry Error`);
    res.status(500).json({
      errorMsg: `❌ Fetch Registry Error`,
    });
  }
});

router.get("/findByNamespace/:input", async (req, res) => {
  try {
    const input = req.params.input;
    const registry = await WalletRegistry.findOne({
      nspace: input,
    });
    res.status(200).json(registry);
  } catch (err) {
    console.error(`❌ Fetch Registry Error`);
    res.status(500).json({
      errorMsg: `❌ Fetch Registry Error`,
    });
  }
});

export default router;
