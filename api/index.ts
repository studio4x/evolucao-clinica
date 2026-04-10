import { app, startServer } from "../server";

// Ensure the server is initialized (routes, etc.)
try {
  await startServer();
} catch (error) {
  console.error("Failed to start server in Vercel:", error);
}

export default app;
