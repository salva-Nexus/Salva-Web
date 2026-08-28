function buff(value, percentage) {
  return Math.ceil(Number(value) * (Number(percentage) / 100) * 1000) / 1000;
}

export default buff;
