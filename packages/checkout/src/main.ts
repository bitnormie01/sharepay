import { loadCheckoutConfig } from "./config.js";
import { createServices } from "./services.js";

const config = loadCheckoutConfig(process.env);
const services = await createServices(config);
services.app.listen(config.port, () => {
  console.log(`SharePay checkout on :${config.port} · wallet ${config.walletMode} · merchant ${config.merchantUrl}`);
  void services.catalog.list();
});
