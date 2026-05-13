import serverless from 'serverless-http';
import { createApp } from './app.js';

const app = createApp({ serveStatic: false });

export const handler = serverless(app);
