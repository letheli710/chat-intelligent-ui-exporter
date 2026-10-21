// Where live exports go: the main checkout's (gitignored) Output folder by default.
const path = require('node:path');
module.exports = {output:process.env.LIVE_OUTPUT || path.resolve(__dirname, '../../../ChatGPT Exporter/Output/edge-test-output')};
