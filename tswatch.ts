import { TscWatchClient } from 'tsc-watch/client';

const watch = new TscWatchClient();

let port = Number(process.argv[2]);
if (!port) {
  console.log(`Port not specified! Setting default 3000!
Run \`npm start -- <port>\` to change it
`);
  port = 3000;
}

watch.start('--onSuccess', `node ./.js/index.js ${port}`);

try {
} catch (e) {
  watch.kill(); // Fatal error, kill the compiler instance.
}
