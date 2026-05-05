// Test script
(async () => {
  console.log("Testing endpoint...");
  const res = await fetch("http://localhost:3000/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "list my yesterday events" })
  });
  const json = await res.json();
  console.log("Response:", json);
  console.log("Done");
})().catch(console.error);
