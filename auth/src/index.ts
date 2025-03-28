import express from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./auth";

const app = express();
const port = process.env.PORT || 3000;

// Mount auth routes with the correct handler
app.all("/api/auth/*", toNodeHandler(auth));

// Get user session endpoint
app.get("/api/me", async (req, res) => {
  const session = await auth.api.getSession({
     headers: fromNodeHeaders(req.headers),
   });
 return res.json(session);
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Mount express json middleware after Better Auth handler
app.use(express.json());

// Start the server
app.listen(port, () => {
  console.log(`Better Auth service running on port ${port}`);
});
