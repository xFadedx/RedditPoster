import "dotenv/config";

import { createApp } from "./app.js";
import { startScheduler } from "./services/schedulerService.js";

const port = Number(process.env.PORT || 3000);
const app = createApp();

startScheduler();

app.listen(port, () => {
  console.log(`Marketing automation server running at http://localhost:${port}`);
});
