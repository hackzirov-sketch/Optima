const autocannon = require("autocannon");

function run(i) {
  const instance = autocannon({
    url: "http://localhost:5001/api/v1/auth/register",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    // Har bir request uchun yangi random ma'lumot yaratamiz
    setupClient: (client) => {
      client.on('request', (req) => {
        if (!req) return;
        const id = Math.random().toString(36).substring(7);
        req.body = JSON.stringify({
          fullName: `User ${id}`,
          username: `user_${id}_${Date.now()}`,
          email: `user_${id}_${Date.now()}@test.com`,
          password: "Password123!",
        });
      });
    },
    connections: 10,
    duration: 20,
  });

  autocannon.track(instance, { renderProgressBar: true });

  instance.on("done", (result) => {
    console.log(`\n✅ Test ${i} yakunlandi`);
    console.log("Muvaffaqiyatli (2xx):", result['2xx']);
    console.log("Xatolar (non-2xx):", result['non2xx']);
    console.log("O'rtacha kechikish (Latency):", result.latency.average, "ms");
    console.log("RPS (Requests per second):", result.requests.average);
  });

  return instance;
}

// Haqiqiy yuklamani o'lchash
run(1);
