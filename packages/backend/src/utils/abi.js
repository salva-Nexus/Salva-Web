const SAFE_PROXY_FACTORY = [
  "function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) returns (address proxy)",
];

const FACTORY_EVENT = [
  "event ProxyCreation(address indexed proxy, address singleton)",
];

const SAFE_SETUP = [
  "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external",
];

const CHAINLINK = [
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
];

const ERC20 = [
  "function name() view returns (string)",
  "function decimals() pure returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint)",
  "function transfer(address to, uint amount)",
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)",
  "function totalSupply() external view returns (uint256)"
];

const SINGLETON = [
  "function resolveAddress(bytes) view returns (address)",
  "function nameToByte(string memory _name) pure returns (bytes memory _nb)",
];

const REGISTRY = [
  "function link(bytes calldata name, address wallet, bytes calldata signature) external returns (bool)",
  "function unlink(bytes calldata _name) external returns (bool)",
  "function resolveAddress(bytes calldata name) view returns (address)",
  "function namespace() view returns (string memory)",
];

const REGISTRYFACTORY = ["function getFee() view returns (uint256)"];

const SAFE = [
  "function execTransaction(address to,uint256 value,bytes calldata data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes memory signatures) public payable returns(bool)",
  "function encodeTransactionData(address to,uint256 value,bytes calldata data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,uint256 _nonce) public view returns(bytes memory)",
  "function getTransactionHash(address to,uint256 value,bytes calldata data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,uint256 _nonce) public view returns(bytes32)",
  "function nonce() view returns(uint256)",
  "function getOwners() public view returns (address[] memory)",
];

const MULTISEND = [
  "function multiSend(address[] calldata to, uint256[] calldata value, bytes[] calldata data)",
];

const SANT_ABI = [
  "function mint(address to, uint256 amount) external",
  "function decimals() public view returns (uint8)",
  "function balanceOf(address) view returns (uint)",
  "function transfer(address to, uint amount)",
];

const POOL_IFACE = [
  "function swapExactNGNAmountForUSD(address _receiver, address _usdTokenOut, address _ngnTokenIn, uint256 _ngnAmountIn) external returns (bool)",
  "function swapExactUSDAmountForNGN(address _receiver, address _usdTokenIn, address _ngnTokenOut, uint256 _usdAmountIn) external returns (bool)",
  "function swapForExactUSDAmount(address _receiver, address _usdTokenOut, address _ngnTokenIn, uint256 _usdAmountOut) external returns (bool)",
  "function swapForExactNGNAmount(address _receiver, address _usdTokenIn, address _ngnTokenOut, uint256 _ngnAmountOut) external returns (bool)",
  "function updateBuyRate(uint256 _exRate) external returns (bool)",
  "function updateSellRate(uint256 _exRate) external returns (bool)",
  "function _getBuyRate() public view returns (uint256)",
  "function _getSellRate() public view returns (uint256)",
  "function provideLiquidity(address asset, uint256 amount) external returns (bool)",
  "function removeLiquidity(address asset, uint256 amount) external returns (bool)",
  "function pause() external returns (bool)",
  "function unpause() external returns (bool)",
  "function isPaused() external view returns (bool)",
  "function getExactUSDAmountOut(address usdToken, uint256 ngnAmountIn, uint256 exRate) public view returns (uint256)",
  "function getExactNGNAmountOut(address usdToken, uint256 usdAmountIn, uint256 exRate) public view returns (uint256)",
  "function getExactNGNAmountIn(address usdToken, uint256 usdAmountOut, uint256 exRate) public view returns (uint256)",
  "function getExactUSDAmountIn(address usdTokenIn, uint256 ngnAmountOut, uint256 exRate) public view returns (uint256)",
];

const FACTORY_IFACE = ["function deployPool() external returns (address pool)"];

export {
  SAFE_PROXY_FACTORY,
  SAFE_SETUP,
  CHAINLINK,
  FACTORY_EVENT,
  ERC20,
  SINGLETON,
  REGISTRY,
  REGISTRYFACTORY,
  SAFE,
  MULTISEND,
  SANT_ABI,
  POOL_IFACE,
  FACTORY_IFACE,
};
