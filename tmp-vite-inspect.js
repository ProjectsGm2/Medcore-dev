import { createServer } from 'vite';

(async () => {
  const s = await createServer({ configFile: 'vite.config.js' });
  console.log('root:', s.config.root);
  console.log('server:', JSON.stringify(s.config.server, null, 2));
  await s.close();
})();
