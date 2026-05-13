import { createApp, config, missingConfig } from './app.js';

const app = createApp({ serveStatic: true });

app.listen(config.port, () => {
  console.log(`Dialer backend listening on http://localhost:${config.port}`);
  if (missingConfig.length > 0) {
    console.warn(`Missing environment variables: ${missingConfig.join(', ')}`);
  }
});
