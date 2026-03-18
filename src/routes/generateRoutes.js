import { Router } from "express";

import {
  createGeneratedDraft,
  rewriteDraftContent,
  rewriteStandaloneContent
} from "../services/draftService.js";
import { createHttpError, validateCampaignInput } from "../utils/validation.js";

const router = Router();

router.post("/generate", async (request, response, next) => {
  try {
    const campaign = validateCampaignInput(request.body);
    const draft = await createGeneratedDraft(campaign);
    response.status(201).json({ draft });
  } catch (error) {
    next(error);
  }
});

router.post("/rewrite", async (request, response, next) => {
  try {
    const { draftId, platform = "all", tone, content } = request.body || {};

    if (!tone) {
      throw createHttpError(400, "Tone is required for rewriting.");
    }

    if (draftId) {
      const draft = await rewriteDraftContent({ draftId, platform, tone });
      response.json({ draft });
      return;
    }

    if (!content) {
      throw createHttpError(400, "Either draftId or content is required.");
    }

    const rewritten = rewriteStandaloneContent({ content, platform, tone });
    response.json({ content: rewritten });
  } catch (error) {
    next(error);
  }
});

export default router;
