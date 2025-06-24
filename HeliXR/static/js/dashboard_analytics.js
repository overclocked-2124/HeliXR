document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard analytics script loaded');
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