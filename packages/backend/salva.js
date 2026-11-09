import { ethers } from 'ethers';
import { Buffer } from 'buffer';

class SNS {
  constructor(singleton, pKey, rpc) {
    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(pKey, provider);

    this.SNSCONFIG = {
      SINGLETON_ADDRESS: singleton,
      SINGLETON: new ethers.Contract(singleton, this._singletonAbi(), wallet),
      OWNER: wallet,
      PROVIDER: provider,
    };
  }
  _singletonAbi() {
    return [
      'function link(bytes32 nameHash, bytes32 nsKey, bytes32 data) external returns (bool)',
      'function unlink(bytes32 nameHash, bytes32 nsKey) external returns (bool)',
      'function resolveAddr(bytes32 nameHash, bytes32 nsKey) view returns (address)',
      'function resolve(bytes32 nameHash, bytes32 nsKey) view returns (bytes32)',
    ];
  }

  _snsConfig() {
    return this.SNSCONFIG;
  }

  writeContract(pKey) {
    const signer = pKey
      ? new ethers.Wallet(pKey, this._snsConfig().PROVIDER)
      : this._snsConfig().OWNER;
    return new ethers.Contract(this._snsConfig().SINGLETON_ADDRESS, this._singletonAbi(), signer);
  }

  readContract() {
    return new ethers.Contract(
      this._snsConfig().SINGLETON_ADDRESS,
      this._singletonAbi(),
      this._snsConfig().PROVIDER
    );
  }

  async resolve(fullName) {
    const parsed = this.parseHandle(fullName);
    const contract = this.readContract();
    return await contract.resolve(parsed.nameHash, parsed.nsKey);
  }

  async resolveAddr(fullName) {
    const parsed = this.parseHandle(fullName);
    const contract = this.readContract();
    return await contract.resolveAddr(parsed.nameHash, parsed.nsKey);
  }

  async linkName(fullName, data) {
    const parsed = this.parseHandle(fullName);
    const dataBytes32 = this.parse32(data);
    const singleton = this._snsConfig().SINGLETON;

    const tx = await singleton.link(parsed.nameHash, parsed.nsKey, dataBytes32);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async unlink(fullName) {
    const parsed = this.parseHandle(fullName);
    const singleton = this._snsConfig().SINGLETON;

    const tx = await singleton.unlink(parsed.nameHash, parsed.nsKey);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  parse32(value) {
    const uint256Max = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    let hex;
    let isString = false;
    if (typeof value !== 'string') throw new TypeError('Convert to string');
    if (!value.startsWith('0x')) {
      try {
        let val = value;
        if (value.includes('e')) {
          let [manti, exp] = value.split('e');
          exp = exp.includes('+') ? exp.slice(1) : exp;
          if (manti.includes('.')) {
            const [left, right] = manti.split('.');
            exp -= right.length;
            manti = `${left}${right}`;
          }
          val = BigInt(manti) * 10n ** BigInt(exp);
        }
        if (!value.includes(' ')) {
          hex = BigInt(val).toString(16);
          if (BigInt(`0x${hex}`) > uint256Max) throw new TypeError('Overflow');
        } else {
          const buff = Buffer.from(value, 'utf-8');
          if (buff.length > 32) throw new TypeError('Overflow');
          hex = buff.toString('hex');
          isString = true;
        }
      } catch {
        const buff = Buffer.from(value, 'utf-8');
        if (buff.length > 32) throw new TypeError('Overflow');
        hex = buff.toString('hex');
        isString = true;
      }
    } else {
      if (BigInt(value) > uint256Max) throw new TypeError('Overflow');
      hex = value.slice(2);
    }

    const diff = 32 - hex.length / 2;
    const zeros = (10n ** BigInt(diff * 2)).toString();
    const skim = zeros.slice(1);
    return isString ? `0x${hex}${skim}` : `0x${skim}${hex}`;
  }

  parseHandle(fullHandle) {
    const [name, namespace] = fullHandle.split('@');
    if (!name || !namespace) throw new Error("Invalid handle format. Expected 'name@namespace'");

    const formattedNs = `@${namespace.toLowerCase()}`;
    const nameHash = ethers.id(name);
    const nsKey = ethers.id(formattedNs);
    return { nameHash, nsKey };
  }

  toText(value) {
    if (typeof value !== 'string') throw new TypeError('Convert to string');
    const buff = Buffer.from(value.slice(2, value.length), 'hex');
    return buff.toString('utf-8');
  }

  toNum(value) {
    if (typeof value !== 'string') throw new TypeError('Convert to string');
    const val = value.startsWith('0x') ? value : `0x${value}`;
    const num = BigInt(val).toString();
    return BigInt(num);
  }
}

export { SNS };
