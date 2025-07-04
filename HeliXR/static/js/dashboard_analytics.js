// Alert state tracking
const alertStates = {
  temperature: false,
  humidity: false,
  ph: false,
  color: false
};

// Initialize alert system
function initAlertSystem() {
  // Close button handler
  document.getElementById('alertClose').addEventListener('click', () => {
    const alertPopup = document.getElementById('alertPopup');
    alertPopup.classList.remove('show');
  });
}

// Check thresholds and show alerts
function checkThresholds(data) {
  if (!data.thresholds) return;
  
  const messages = [];
  
  // Temperature check
  if (data.temperature > data.thresholds.temp_threshold) {
    if (!alertStates.temperature) {
      messages.push(`Temperature exceeded threshold (${data.thresholds.temp_threshold}°C)`);
      alertStates.temperature = true;
    }
  } else {
    alertStates.temperature = false;
  }
  
  // Humidity check
  if (data.humidity > data.thresholds.humidity_threshold) {
    if (!alertStates.humidity) {
      messages.push(`Humidity exceeded threshold (${data.thresholds.humidity_threshold}%)`);
      alertStates.humidity = true;
    }
  } else {
    alertStates.humidity = false;
  }
  
  // pH check
  if (data.ph > data.thresholds.ph_threshold || data.ph < data.thresholds.ph_min) {
    if (!alertStates.ph) {
      const min = data.thresholds.ph_min || 0;
      const max = data.thresholds.ph_threshold;
      messages.push(`pH out of range (${min}-${max})`);
      alertStates.ph = true;
    }
  } else {
    alertStates.ph = false;
  }
  
  // Color difference check
  if (data.color_rgb) {
    const expectedColor = [255, 200, 100];
    const diff = calculateColorDifference(data.color_rgb, expectedColor);
    if (diff > data.thresholds.color_diff_threshold) {
      if (!alertStates.color) {
        messages.push(`Color deviation detected`);
        alertStates.color = true;
      }
    } else {
      alertStates.color = false;
    }
  }
  
  // Show alert if we have messages
  if (messages.length > 0) {
    showAlert(messages.join('<br>'));
  }
}

function showAlert(message) {
  const alertPopup = document.getElementById('alertPopup');
  const alertMessage = document.getElementById('alertMessage');
  
  // Update message
  alertMessage.innerHTML = `
    <div class="alert-header">
      <i class="fas fa-exclamation-triangle"></i> 
      <strong>Sensor Alert</strong>
    </div>
    <div class="alert-body">${message}</div>
  `;
  
  // Show popup
  alertPopup.classList.add('show');
  
  // Auto-hide after 10 seconds
  setTimeout(() => {
    alertPopup.classList.remove('show');
  }, 10000);
}

const THRESHOLDS = {
  TEMP_HIGH: 30,
  TEMP_LOW: 15,
  HUMIDITY_HIGH: 70,
  HUMIDITY_LOW: 30,
  LIGHT_HIGH: 1000,
  LIGHT_LOW: -100,
  PH_HIGH: 8.5,
  PH_LOW: 6.5,
  COLOR_DIFF: 4000
};

// Initialize warning system
function initWarningSystem() {
  // Close button handler
  document.getElementById('warningClose').addEventListener('click', () => {
    closeWarningPopup();
  });
  document.getElementById('viewDetailsBtn').addEventListener('click', () => {
    // Navigate to the diagnostics page
    window.location.href = "/dashboard_command";
  });
}

function closeWarningPopup() {
  const warningPopup = document.getElementById('warningPopup');
  warningPopup.style.display = 'none';
}

function showWarningPopup(message) {
  const warningPopup = document.getElementById('warningPopup');
  const warningMessage = document.getElementById('warningMessage');
  
  // Update message
  warningMessage.textContent = message;
  
  // Show popup
  warningPopup.style.display = 'block';
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


document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard analytics script loaded');
    initAlertSystem();
    initWarningSystem(); 
    // Declare chart variables
    let lineChart, pieChart, phChart; // Changed radarChart to phChart

    // Expected color value (adjust as needed)
    const EXPECTED_COLOR = [255, 200, 100]; // RGB values for expected color

    function initCharts() {
        initLineChart();
        initPieChart();
        initPhChart(); // Changed from initRadarChart
    }

    function initLineChart() {
        const ctx = document.getElementById('lineChart').getContext('2d');
        lineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Environment Temp (°C)',
                    data: [],
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    fill: true,
                    tension: 0.4,
                }, {
                    label: 'Sensor Temp (°C)',
                    data: [],
                    borderColor: '#74b9ff',
                    backgroundColor: 'rgba(116, 185, 255, 0.1)',
                    fill: true,
                    tension: 0.4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    y: { beginAtZero: false, grid: { color: 'rgba(0, 0, 0, 0.05)' } },
                    x: { grid: { display: false } }
                },
                animation: { duration: 500 }
            }
        });
    }

    function initPieChart() {
        const ctx = document.getElementById('pieChart').getContext('2d');
        pieChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Environment Humidity (%)', 'Dry Air (%)'],
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#36a2eb', '#e9ecef'],
                    borderColor: ['#ffffff'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                cutout: '70%'
            }
        });
    }

    // --- NEW: pH LINE CHART INITIALIZATION (replaces radar chart) ---
    function initPhChart() {
        const ctx = document.getElementById('phChart').getContext('2d');
        phChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'pH Level',
                    data: [],
                    borderColor: '#84fab0', // Green color
                    backgroundColor: 'rgba(132, 250, 176, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }, // Hide legend for single-line chart
                scales: {
                    y: {
                        beginAtZero: false,
                        suggestedMin: 6, // Set a reasonable min/max for pH
                        suggestedMax: 8,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' }
                    },
                    x: { grid: { display: false } }
                },
                animation: { duration: 500 }
            }
        });
    }

    // --- REMOVED: calculateColorDifference function is no longer needed ---

    // Convert RGB array to CSS color
    function rgbToCss(rgb) {
        if (!rgb || rgb.length !== 3) return 'rgb(240, 240, 240)';
        return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }

    // --- MODIFIED: Update color comparison display (difference part removed) ---
    function updateColorComparison(currentRGB) {
        const currentColorElement = document.getElementById('currentColor');
        const currentColorValue = document.getElementById('currentColorValue');
        const expectedColorElement = document.getElementById('expectedColor');
        const expectedColorValue = document.getElementById('expectedColorValue');

        if (currentColorElement && currentColorValue) {
            currentColorElement.style.backgroundColor = rgbToCss(currentRGB);
            currentColorValue.textContent = `RGB: ${currentRGB.join(', ')}`;
        }

        if (expectedColorElement && expectedColorValue) {
            expectedColorElement.style.backgroundColor = rgbToCss(EXPECTED_COLOR);
            expectedColorValue.textContent = `RGB: ${EXPECTED_COLOR.join(', ')}`;
        }
    }

    function fetchData() {
        fetch('/api/sensor-data')
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw new Error(err.error || `HTTP error! status: ${response.status}`) });
                }
                return response.json();
            })
            .then(data => {
                const errorElement = document.getElementById('errorMessage');
                if (errorElement) errorElement.style.display = 'none';
                updateDashboard({
                    env_temp: data.env_temp || 0,
                    env_humidity: data.env_humidity || 0,
                    temperature: data.temperature || 0,
                    humidity: data.humidity || 0,
                    light: rgbToLight(data.color_rgb),
                    ph: data.pH || 0,
                    color_rgb: data.color_rgb || [0, 0, 0]
                });
            })
            .catch(err => {
                console.error('Error loading sensor data:', err);
                const errorElement = document.getElementById('errorMessage');
                if (errorElement) {
                    errorElement.textContent = `Data Fetch Error: ${err.message}. Retrying...`;
                    errorElement.style.display = 'block';
                }
            });
    }

    function updateDashboard(data) {
        // Update card values
        document.getElementById('tempValue').textContent = `${data.temperature.toFixed(1)}°C`;
        document.getElementById('humidityValue').textContent = `${data.humidity.toFixed(1)}%`;
        document.getElementById('lightValue').textContent = `${data.light} lx`;
        document.getElementById('phValue').textContent = data.ph.toFixed(1);

        // Update color comparison
        if (data.color_rgb) {
            updateColorComparison(data.color_rgb);
        }

        const MAX_DATA_POINTS = 20;
        const currentTime = new Date().toLocaleTimeString();

        // 1. Update Line Chart
        if (lineChart) {
            if (lineChart.data.labels.length >= MAX_DATA_POINTS) {
                lineChart.data.labels.shift();
                lineChart.data.datasets.forEach(dataset => dataset.data.shift());
            }
            lineChart.data.labels.push(currentTime);
            lineChart.data.datasets[0].data.push(data.env_temp);
            lineChart.data.datasets[1].data.push(data.temperature);
            lineChart.update('none');
        }

        // 2. Update Pie Chart
        if (pieChart) {
            pieChart.data.datasets[0].data[0] = data.env_humidity;
            pieChart.data.datasets[0].data[1] = 100 - data.env_humidity;
            pieChart.update('none');
        }

        // 3. Update pH Chart (replaces radar chart)
        if (phChart) {
            if (phChart.data.labels.length >= MAX_DATA_POINTS) {
                phChart.data.labels.shift();
                phChart.data.datasets[0].data.shift();
            }
            phChart.data.labels.push(currentTime);
            phChart.data.datasets[0].data.push(data.ph);
            phChart.update('none');
        }
        checkThresholds(data);
    }

    function rgbToLight(rgb) {
        if (!rgb || rgb.length !== 3) return 0;
        return Math.round((rgb[0] + rgb[1] + rgb[2]) / 3);
    }

    // Initialize and start data updates
    try {
        initCharts();
        fetchData();
        setInterval(fetchData, 5000);
    } catch (error) {
        console.error('Initialization error:', error);
        const errorElement = document.getElementById('errorMessage');
        if (errorElement) {
            errorElement.textContent = `Dashboard Initialization Error: ${error.message}`;
            errorElement.style.display = 'block';
        }
    }
});