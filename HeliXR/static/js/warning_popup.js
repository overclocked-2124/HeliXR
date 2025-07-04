// static/js/dashboard_common.js

// Threshold configuration
const THRESHOLDS = {
  TEMP_HIGH: 35,
  TEMP_LOW: 15,
  HUMIDITY_HIGH: 70,
  HUMIDITY_LOW: 30,
  LIGHT_HIGH: 1000,
  LIGHT_LOW: 500,
  PH_HIGH: 8.5,
  PH_LOW: 6.5,
  COLOR_DIFF: 5000
};

// Initialize warning system
function initWarningSystem() {
  // Close button handler
  document.getElementById('warningClose')?.addEventListener('click', () => {
    closeWarningPopup();
  });
  
  // View Details button handler
  document.getElementById('viewDetailsBtn')?.addEventListener('click', () => {
    window.location.href = "/dashboard_command";
  });
}

function closeWarningPopup() {
  const warningPopup = document.getElementById('warningPopup');
  if (warningPopup) warningPopup.style.display = 'none';
}

function showWarningPopup(message) {
  const warningPopup = document.getElementById('warningPopup');
  const warningMessage = document.getElementById('warningMessage');
  
  if (warningPopup && warningMessage) {
    warningMessage.textContent = message;
    warningPopup.style.display = 'block';
  }
}

// Check thresholds and show warnings
function checkThresholds(data) {
  const messages = [];
  
  // Temperature check
  if (data.temperature > THRESHOLDS.TEMP_HIGH) {
    messages.push(`Temperature too high! (${data.temperature.toFixed(1)}°C > ${THRESHOLDS.TEMP_HIGH}°C)`);
  } else if (data.temperature < THRESHOLDS.TEMP_LOW) {
    messages.push(`Temperature too low! (${data.temperature.toFixed(1)}°C < ${THRESHOLDS.TEMP_LOW}°C)`);
  }
  
  // Humidity check
  if (data.humidity > THRESHOLDS.HUMIDITY_HIGH) {
    messages.push(`Humidity too high! (${data.humidity.toFixed(1)}% > ${THRESHOLDS.HUMIDITY_HIGH}%)`);
  } else if (data.humidity < THRESHOLDS.HUMIDITY_LOW) {
    messages.push(`Humidity too low! (${data.humidity.toFixed(1)}% < ${THRESHOLDS.HUMIDITY_LOW}%)`);
  }
  
  // Light intensity check
  if (data.light > THRESHOLDS.LIGHT_HIGH) {
    messages.push(`Light intensity too high! (${data.light} lx > ${THRESHOLDS.LIGHT_HIGH} lx)`);
  } else if (data.light < THRESHOLDS.LIGHT_LOW) {
    messages.push(`Light intensity too low! (${data.light} lx < ${THRESHOLDS.LIGHT_LOW} lx)`);
  }
  
  // pH level check
  if (data.ph > THRESHOLDS.PH_HIGH) {
    messages.push(`pH level too high! (${data.ph.toFixed(1)} > ${THRESHOLDS.PH_HIGH})`);
  } else if (data.ph < THRESHOLDS.PH_LOW) {
    messages.push(`pH level too low! (${data.ph.toFixed(1)} < ${THRESHOLDS.PH_LOW})`);
  }
  
  // Color difference check
  if (data.color_rgb) {
    const expectedColor = [255, 200, 100];
    const diff = calculateColorDifference(data.color_rgb, expectedColor);
    if (diff > THRESHOLDS.COLOR_DIFF) {
      messages.push(`Color deviation detected! (Difference: ${diff.toFixed(1)})`);
    }
  }
  
  // Show warning if we have messages
  if (messages.length > 0) {
    showWarningPopup(messages.join('\n'));
  }
}

// Helper function to calculate color difference
function calculateColorDifference(rgb1, rgb2) {
  return Math.sqrt(
    Math.pow(rgb1[0] - rgb2[0], 2) +
    Math.pow(rgb1[1] - rgb2[1], 2) +
    Math.pow(rgb1[2] - rgb2[2], 2)
  );
}

// Start monitoring sensor data
function startMonitoring() {
    if (window.disableWarningMonitoring) {
    return;
  }
  // Initialize warning system
  initWarningSystem();

  
  // Function to fetch sensor data
  function fetchSensorData() {
    fetch('/api/sensor-data')
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        checkThresholds(data);
      })
      .catch(error => {
        console.error('Error fetching sensor data:', error);
      });
  }
  
  // Fetch immediately and then every 5 seconds
  fetchSensorData();
  setInterval(fetchSensorData, 5000);
}

// Start monitoring when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Only start monitoring if we're on a dashboard page
  if (document.querySelector('.dashboard-container')) {
    startMonitoring();
  }
});