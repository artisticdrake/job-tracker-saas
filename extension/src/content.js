// This script runs automatically on LinkedIn job pages
function sendJobToApp() {
  const currentUrl = window.location.href;
  
  // Basic check to ensure we are on a job page
  if (currentUrl.includes('/jobs/view/')) {
    fetch('http://localhost:3001/autofill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentUrl })
    })
    .then(response => response.json())
    .then(data => console.log('JobTracker: URL sent to app', data))
    .catch(err => console.error('JobTracker: App not running or bridge failed', err));
  }
}

// Run immediately
sendJobToApp();

// LinkedIn often loads content dynamically; listen for URL changes
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    sendJobToApp();
  }
}).observe(document, {subtree: true, childList: true});