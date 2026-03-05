document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const status = document.getElementById('status');
  
  status.innerText = "Analyzing page...";

  // 1. Tell Electron to process the URL via your existing LLM logic
  try {
    const response = await fetch('http://localhost:3001/process-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: tab.url })
    });
    const result = await response.json();
    
    if (result.ok) {
      document.getElementById('jobUrl').value = tab.url;
      document.getElementById('company').value = result.data.company;
      document.getElementById('position').value = result.data.position;
      document.getElementById('location').value = result.data.location;
      document.getElementById('salary').value = result.data.salary;
      status.innerText = "Data extracted!";
    }
  } catch (err) {
    status.innerText = "Connect your Electron app first.";
  }
});

// 2. The Accept Button - Silently saves to database
document.getElementById('acceptBtn').addEventListener('click', async () => {
  const jobData = {
    company: document.getElementById('company').value,
    position: document.getElementById('position').value,
    location: document.getElementById('location').value,
    salary: document.getElementById('salary').value,
    jobUrl: document.getElementById('jobUrl').value,
    dateApplied: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    status: "Applied"
  };

  await fetch('http://localhost:3001/save-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jobData)
  });
  window.close(); // Close the popup
});

document.getElementById('rejectBtn').addEventListener('click', () => window.close());