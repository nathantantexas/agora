import { createApp } from './app.js';
import { loadCities, loadNews } from '@agora/core/node';
import { BRAND } from '@agora/core';

const port = Number(process.env.PORT) || 8787;
const cities = loadCities();
const news = loadNews();
const app = createApp({ cities, news });

app.listen(port, () => {
  console.log(`${BRAND.name} API listening on http://localhost:${port}  (${cities.length} cities, AI ${process.env.ANTHROPIC_API_KEY ? 'on' : 'off: set ANTHROPIC_API_KEY to enable'})`);
});
