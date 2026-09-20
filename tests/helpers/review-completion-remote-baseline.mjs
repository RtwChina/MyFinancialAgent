import application from "../../.tests/review-completion/baseline/cloudflare/worker/src/index.js";
import { wrapReviewWorker } from "./review-completion-remote-adapter.mjs";

export default wrapReviewWorker(application);
