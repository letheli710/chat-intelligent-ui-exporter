// Loaded just before fast-content.js by the manifest's content_scripts: the panel stays on the page
// (buttons beside the input box, the sidebar closed) instead of opening as it does when injected by hand.
globalThis.ChatExportResident = true;
