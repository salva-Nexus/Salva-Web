function _sameToken(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

// Step 1: never send more than the balance
function _clampToBalance(balance, amountWei) {
  const bal = BigInt(balance);
  const amt = BigInt(amountWei);
  if (bal <= 0n) {
    throw new Error('❌ Insufficient balance');
  }
  return amt > bal ? bal : amt;
}

// Fee paid in the token being sent is deducted from the amount, revert only if nothing is left to send
function _deductFee(balance, amountWei, feeWei) {
  const bal = BigInt(balance);
  const amt = BigInt(amountWei);
  const fee = BigInt(feeWei);
  if (bal >= amt + fee) {
    return amt;
  }
  const remaining = bal - fee;
  if (remaining <= 0n) {
    throw new TypeError('Insufficient balance to cover fee, please top up.');
  }
  return remaining;
}

// keeps slippage thresholds proportional when the amount was reduced
function _scaleByAmount(valueWei, newAmountWei, oldAmountWei) {
  if (BigInt(oldAmountWei) <= 0n || BigInt(newAmountWei) >= BigInt(oldAmountWei)) {
    return BigInt(valueWei);
  }
  return (BigInt(valueWei) * BigInt(newAmountWei)) / BigInt(oldAmountWei);
}

export { _sameToken, _clampToBalance, _deductFee, _scaleByAmount };
