import application from "../../cloudflare/worker/src/index.js";
import { wrapReviewWorker } from "./review-completion-remote-adapter.mjs";

export default wrapReviewWorker(application);
