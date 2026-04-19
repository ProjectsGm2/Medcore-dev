const fn = (id) => `\`${id.replace(/`/g, '')}\``;

const out = fn('created_date');
console.log('output:', out);
console.log('json:', JSON.stringify(out));
