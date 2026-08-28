const BASE_URL = "http://localhost:3001";
const stats = await fetch(`${BASE_URL}/api/data/stats`, {
  method: "GET",
});

const data = await stats.json();
console.log(data);
