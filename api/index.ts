import { app, startServer } from "../server";

// Initialize server logic
startServer().catch(err => {
  console.error("Failed to initialize server:", err);
});

export default app;
