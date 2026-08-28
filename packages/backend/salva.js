import { ethers } from "ethers";
class SNS {
  constructor(abi, registry, factory, pKey, rpc) {
    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(pKey, provider);

    let reg;
    let fac;
    Object.values(abi).forEach((r) => {
      r.forEach((l) => {
        if (l.includes("link")) reg = r;
        if (l.includes("getFee")) fac = r;
      });
    });

    this.SNSCONFIG = {
      ABI: { abi },
      REG_ADDRESS: registry,
      FACTORY_ADDR: factory,
      REGISTRY: new ethers.Contract(registry, reg, wallet),
      FACTORY: new ethers.Contract(factory, fac, provider),
      OWNER: wallet,
      PROVIDER: provider,
      RPC: rpc,
    };
  }
  _snsConfig() {
    return this.SNSCONFIG;
  }

  _buildConfig(pKey) {
    return new ethers.Wallet(pKey, this._snsConfig().PROVIDER);
  }

  writeContract(pKey) {
    const owner = this._buildConfig(pKey);
    return new ethers.Contract(
      this._snsConfig().REG_ADDRESS,
      this._snsConfig().ABI.REGISTRY,
      owner,
    );
  }

  readContract() {
    return new ethers.Contract(
      this._snsConfig().REG_ADDRESS,
      this._snsConfig().ABI.REGISTRY,
      this._snsConfig().PROVIDER,
    );
  }

  async resolve(name) {
    const nameToByte = ethers.toUtf8Bytes(name);
    const contract = this.readContract();
    return await contract.resolveAddress(name);
  }

  async getFee() {
    const contract = this._snsConfig().FACTORY;
    return await contract.getFee();
  }

  async namespace() {
    const contract = this._snsConfig().REGISTRY;
    return await contract.namespace();
  }

  _dataHash(name, address) {
    const suffix = address.slice(2, address.length);
    const nameBytes = ethers.toUtf8Bytes(name);
    const weldData = `${ethers.hexlify(nameBytes)}${suffix}`;
    return {
      nameBytes: nameBytes,
      address: address,
      hash: ethers.getBytes(ethers.keccak256(weldData)),
    };
  }

  async linkName(signerConfig /**wallet */, name, address) {
    const data = this._dataHash(name, address);
    const signature = await signerConfig.signMessage(data.hash);
    const registry = this._snsConfig().REGISTRY;

    const tx = await registry.link(
      data.nameBytes,
      address,
      ethers.hexlify(signature),
    );

    const receipt = await tx.wait();
    return receipt.txHash;
  }

  async unlink(fullName) {
    const data = this._dataHash(name, address);
    const registry = this._snsConfig().REGISTRY;

    const tx = await registry.unlink(data.nameBytes);

    const receipt = await tx.wait();
    return receipt.txHash;
  }
}

class erc20 {
  constructor(erc20abi, rpc, token, pKey) {
    if (!rpc.includes("https://")) {
      throw new Error("Invalid Url");
    }

    const addr = ether.getAddress(token);
    const provider = new ethers.JsonRpcProvider(rpc);
    let key;
    let wallet;
    if (pKey) {
      key = ethers.getAddress(pKey);
      wallet = new ethers.Wallet(key, provider);
    }

    this.txData = {
      ERC20ABI: [...erc20abi],
      RPC: rpc,
      PROVIDER: provider,
      WALLET: wallet,
      TOKEN: addr,
    };
  }

  _fetchData() {
    return this.txData;
  }

  _user() {
    return this._fetchData().WALLET.address;
  }

  readContract() {
    return new ethers.Contract(
      this.txData.TOKEN,
      this.txData.ERC20ABI,
      this.txData.PROVIDER,
    );
  }

  writeContract() {
    return new ethers.Contract(
      this.txData.TOKEN,
      this.txData.ERC20ABI,
      this.txData.WALLET,
    );
  }

  async getBalance(user) {
    return this.txData.PROVIDER.getBalance(user);
  }

  async transfer(to, value) {
    const val = typeof value !== "string" ? value.toString() : value;
    const contract = this.writeContract();

    const dec = await this.decimals();
    const sym = await this.symbol();
    console.log(`SALVA: ${sym} Decimal: ${dec}`);

    console.log(`SALVA: Sending ${value} ${sym} 💸💸 to ${to}...`);
    console.log(`SALVA: Building TX....`);
    const tx = await contract.transfer(to, ethers.parseUnit(val, Number(dec)));
    console.log(`SALVA: Transaction Submitted ✅`);

    const receipt = await tx.wait();
    return receipt;
  }

  async approve(spender, amount) {
    const addr = ethers.getAddress(spender);
    await this.writeContract().approve(addr, amount);
  }

  async allowance(spender) {
    const amount = await this.readContract().allowance(
      this.txData.WALLET.address,
      spender,
    );
    return amount;
  }

  async decimals() {
    return Number(await this.readContract().decimals());
  }

  async symbol() {
    return await this.readContract().symbol();
  }
}

export { SNS, erc20 };
