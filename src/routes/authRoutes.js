import { Router } from "express";

import {
  createRedditAuthUrl,
  createTwitterAuthUrl,
  getIntegrationStatus,
  renderAuthCompletion
} from "../services/authService.js";

const router = Router();

router.get("/integrations", async (_request, response, next) => {
  try {
    const integrations = await getIntegrationStatus();
    response.json({ integrations });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/reddit/start", (request, response, next) => {
  try {
    response.redirect(createRedditAuthUrl(request));
  } catch (error) {
    next(error);
  }
});

router.get("/auth/reddit/callback", async (request, response, next) => {
  try {
    const html = await renderAuthCompletion("reddit", request);
    response.type("html").send(html);
  } catch (error) {
    next(error);
  }
});

router.get("/auth/twitter/start", (request, response, next) => {
  try {
    response.redirect(createTwitterAuthUrl(request));
  } catch (error) {
    next(error);
  }
});

router.get("/auth/twitter/callback", async (request, response, next) => {
  try {
    const html = await renderAuthCompletion("twitter", request);
    response.type("html").send(html);
  } catch (error) {
    next(error);
  }
});

export default router;
