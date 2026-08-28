import {
  checkNameAvailability,
  resolveToAddress,
} from "../services/resolverServices.js";
import express from "express";
import { isReservedName } from "../models/ReservedNames.js";

const router = express.Router();

router.get("/isAvail/:weldedName/:regAddress", async (req, res) => {
  const name = req.params.weldedName;
  const registry = req.params.regAddress;

  try {
    const address = await resolveToAddress(name, registry);
    if (isReservedName(name)) {
      return res.status(400).json({
        status: false,
        message: `Name is whitelisted, Contact Support to claim name`,
        supportEmail: `charlieonyii42@gmail.com`,
      });
    }
    res.status(200).json({
      status: true,
      address: address,
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
