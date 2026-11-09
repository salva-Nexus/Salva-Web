const SAFE_PROXY_FACTORY = [
  'function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) returns (address proxy)',
];

const FACTORY_EVENT = ['event ProxyCreation(address indexed proxy, address singleton)'];
const FACTORY_ABI = ['function proxyCreationCode() external view returns (bytes)'];

const SAFE_SETUP = [
  'function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external',
];

const CHAINLINK = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
];

const ERC20 = [
  'function name() view returns (string)',
  'function decimals() pure returns (uint8)',
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint)',
  'function transfer(address to, uint amount)',
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
];

const NGN_ORACLE = [
  'function decimals() external view returns (uint8)',
  'function updatePrice(uint256 newPrice) external returns (bool)',
  'function getUsdPricePerNgn() external view returns (uint256 price, uint256 updatedAt)',
  'function getAssetPricePerNgn(address asset) external view returns (uint256 price, uint256 updatedAt)',
];

const SINGLETON = [
  'function initializeRegistry(string memory namespaceHandle, address[] memory owners) public payable returns (address)',
  'function reInitializeRegistry(string memory namespaceHandle, address[] memory owners) public payable returns (address)',
  'function link(bytes32 nameHash, bytes4 nsKey, bytes32 data) external returns (bool)',
  'function unlink(bytes32 nameHash, bytes4 nsKey) external returns (bool)',
  'function resolveAddr(bytes32 nameHash, bytes4 nsKey) view returns (address)',
  'function resolve(bytes32 nameHash, bytes4 nsKey) view returns (bytes32)',
  'function registry(bytes4 nsKey) public view returns (address)',
  'function key(bytes memory nspace) public pure returns (bytes4)',
];

const SAFE = [
  'function execTransaction(address to,uint256 value,bytes calldata data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes memory signatures) public payable returns(bool)',
  'function encodeTransactionData(address to,uint256 value,bytes calldata data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,uint256 _nonce) public view returns(bytes memory)',
  'function getTransactionHash(address to,uint256 value,bytes calldata data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,uint256 _nonce) public view returns(bytes32)',
  'function nonce() view returns(uint256)',
  'function getOwners() public view returns (address[] memory)',
];

const MULTISEND = [
  'function multiSend(address[] calldata to, uint256[] calldata value, bytes[] calldata data)',
];

const MULTISIG = [
  'function propose(address target, uint256 value, bytes calldata data) external returns (bytes32)',
  'function approve(bytes32 proposalHash) external returns (address voter, uint256 remaining)',
  'function execute(address target, uint256 value, bytes calldata data, uint256 nonce) external payable returns (bytes memory)',
  'function proposal(bytes32 proposalHash) external view returns (uint256 timeLock, uint256 remaining, uint256 isProposed, uint256 isValidated, uint256 isExecuted, uint256 nonce)',
];

const SANT_ABI = [
  'function mint(address to, uint256 amount) external',
  'function decimals() public view returns (uint8)',
  'function balanceOf(address) view returns (uint)',
  'function transfer(address to, uint amount)',
];

const POOL_IFACE = [
  'function deployInv(address _assetIn, address _assetOut, address _feed, uint256 _floor, int256 _spread, uint256 _amount, bool _allowSwapBelowFloor, bool _isInverted) external returns (bool)',
  'function swapExactInput(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) external payable returns (bool)',
  'function swapExactOutput(address tokenIn, address tokenOut, uint256 amountOut, uint256 maxAmountIn) external payable returns (bool)',
  'function getPrice(address _base, address _quote) external view returns (uint256, bool)',
  'function getInventory(address _base, address _quote) external view returns (tuple(address assetOut, uint96 floor, address assetIn, int96 spreadBps, address feed, uint128 baseBalance, uint128 quoteBalance, bool allowSwapBelowFloor, bool isInverted) inv)',
  'function updateSpread(address _base, address _quote, int96 _spread) external view returns (bool)',
  'function removeLiquidity(address _base, address _quote, address _assetOut, uint256 amount) external returns (bool)',
  'function addLiquidity(address _base, address _quote, uint256 _amount) external payable returns (bool)',
  'function availableLiquidity(address asset) external view returns (uint256)', // Recommended: marked view if it doesn't modify state
  'function exactAmountOut(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256)',
  'function exactAmountIn(address tokenIn, address tokenOut, uint256 amountOut) external view returns (uint256)',
];

const FACTORY_IFACE = ['function deployPool() external returns (address pool)'];

const CDP_ABI = [
  // ── Collateral registration ──
  'function registerCollateral(address token, uint96 ratio) external',
  'function updateCollateralConfig(address token, uint96 newRatio) external',

  // ── Core position logic ──
  // ETH (token = address(0)): pass collateralAmount = 0 and send the amount as { value }
  'function depositCollateral(address token, uint128 collateralAmount) external payable',
  'function openPosition(address token, uint128 ngnsAmount) external',
  'function settlePosition(address token, uint128 ngnsAmount) external',
  'function withdraw(address token, address receiver, uint128 amount) external',

  // ── Liquidation ──
  'function purge(address user, address token, address receiver, uint128 ngnsAmount) external',

  // ── Atomic compound actions (not payable, so ERC20 collateral only) ──
  'function depositAndOpenPosition(address token, uint128 cAmount, uint128 nAmount) external',
  'function settleAndWithdraw(address token, address receiver, uint128 nAmountToBurn, uint128 cAmountToWithdraw) external',

  // ── Views: position state ──
  'function collateralConfig(address user, address token) view returns (tuple(address priceFeed, uint96 customCollateralRatio))',
  'function positionConfig(address user, address token) view returns (tuple(uint128 collateralDeposited, uint128 mintedNgns))',
  'function userConfig(address user, address token) view returns (tuple(address priceFeed, uint96 customCollateralRatio), tuple(uint128 collateralDeposited, uint128 mintedNgns))',
  'function userPositionHealth(address user, address token, uint256 debtAmount) view returns (uint256)',
  'function collateralAmountWithdrawable(address user, address token) view returns (uint256)',
  'function isRegisteredCollateral(address user, address token) view returns (bool)',

  // ── Views: pricing ──
  'function priceFeed(address pFeed) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function ngnValue(address token, uint256 collateralAmount) view returns (uint256 nValue)',
  'function collateralValue(address token, uint256 ngnsAmount) view returns (uint256 cValue, uint256 liqBonus)',
];

export {
  SAFE_PROXY_FACTORY,
  SAFE_SETUP,
  CHAINLINK,
  FACTORY_ABI,
  FACTORY_EVENT,
  ERC20,
  SINGLETON,
  SAFE,
  MULTISEND,
  SANT_ABI,
  POOL_IFACE,
  FACTORY_IFACE,
  MULTISIG,
  NGN_ORACLE,
  CDP_ABI,
};
