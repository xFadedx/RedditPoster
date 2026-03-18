import { Router } from "express";

import {
  approveDraftSubmission,
  getDraftById,
  listDrafts,
  listJobs,
  submitDraft,
  updateDraft
} from "../services/draftService.js";

const router = Router();

router.get("/drafts", async (_request, response, next) => {
  try {
    const drafts = await listDrafts();
    response.json({ drafts });
  } catch (error) {
    next(error);
  }
});

router.get("/drafts/:draftId", async (request, response, next) => {
  try {
    const draft = await getDraftById(request.params.draftId);
    response.json({ draft });
  } catch (error) {
    next(error);
  }
});

router.patch("/drafts/:draftId", async (request, response, next) => {
  try {
    const draft = await updateDraft(request.params.draftId, request.body || {});
    response.json({ draft });
  } catch (error) {
    next(error);
  }
});

router.post("/drafts/:draftId/submit", async (request, response, next) => {
  try {
    const result = await submitDraft({
      draftId: request.params.draftId,
      ...request.body
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/drafts/:draftId/approve", async (request, response, next) => {
  try {
    const result = await approveDraftSubmission(request.params.draftId);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/jobs", async (_request, response, next) => {
  try {
    const jobs = await listJobs();
    response.json({ jobs });
  } catch (error) {
    next(error);
  }
});

export default router;
