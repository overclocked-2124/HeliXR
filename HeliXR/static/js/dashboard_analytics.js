document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard analytics script loaded');
    let lineChart, pieChart, radarChart;
    let dataCounter = 0;
    
    // Expected color value (adjust as needed)
    const EXPECTED_COLOR = [255, 200, 100]; // RGB values for expected color
    
    function initCharts() {
        initLineChart();
        initPieChart();
        initRadarChart();
    }

    function initLineChart() {
    const ctx = document.getElementById('lineChart').getContext('2d');
    lineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Environment Temp (°C)',
                    data: [],
                    borderColor: '#ff6b6b',
                    backgroundColor: 'transparent',
                    fill: true,
                    tension: 0.4,
                },
                {
                    label: 'Sensor Temp (°C)',
                    data: [],
                    borderColor: '#74b9ff',
                    backgroundColor: 'transparent',
                    fill: true,
                    tension: 0.4,
                }
            ]
        },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: {
                                size: 13
                            }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                },
                animation: {
                    duration: 500
                }
            }
        });
    }

    function initPieChart() {
        const ctx = document.getElementById('pieChart').getContext('2d');
        pieChart = new Chart(ctx, {
            // ... your existing pie chart config ...
        });
    }

    function initRadarChart() {
        const ctx = document.getElementById('radarChart').getContext('2d');
        radarChart = new Chart(ctx, {
            // ... your existing radar chart config ...
        });
    }
    
    // Calculate color difference (0-100%)
    function calculateColorDifference(current, expected) {
        if (!current || !expected || current.length !== 3 || expected.length !== 3) return 0;
        
        let diff = 0;
        for (let i = 0; i < 3; i++) {
            diff += Math.abs(current[i] - expected[i]);
        }
        return Math.min(100, Math.round((diff / 765) * 100));
    }
    
    // Convert RGB array to CSS color
    function rgbToCss(rgb) {
        if (!rgb || rgb.length !== 3) return 'rgb(240, 240, 240)';
        return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
    
    // Update color comparison display
    function updateColorComparison(currentRGB) {
        // Update current color display
        const currentColorElement = document.getElementById('currentColor');
        const currentColorValue = document.getElementById('currentColorValue');
        const expectedColorElement = document.getElementById('expectedColor');
        const expectedColorValue = document.getElementById('expectedColorValue');
        const differenceElement = document.getElementById('colorDifference');
        const fillElement = document.getElementById('differenceFill');
        
        if (currentColorElement && currentColorValue) {
            currentColorElement.style.backgroundColor = rgbToCss(currentRGB);
            currentColorValue.textContent = `RGB: ${currentRGB[0]}, ${currentRGB[1]}, ${currentRGB[2]}`;
        }
        
        if (expectedColorElement && expectedColorValue) {
            expectedColorElement.style.backgroundColor = rgbToCss(EXPECTED_COLOR);
            expectedColorValue.textContent = `RGB: ${EXPECTED_COLOR[0]}, ${EXPECTED_COLOR[1]}, ${EXPECTED_COLOR[2]}`;
        }
        
        if (differenceElement && fillElement) {
            const difference = calculateColorDifference(currentRGB, EXPECTED_COLOR);
            differenceElement.textContent = `${difference}%`;
            fillElement.style.width = `${difference}%`;
            
            // Set status color
            if (difference < 20) {
                fillElement.style.background = '#4CAF50';
            } else if (difference < 50) {
                fillElement.style.background = '#FF9800';
            } else {
                fillElement.style.background = '#F44336';
            }
        }
    }


    

    function fetchData() {
        console.log('Fetching data from API...');
        fetch('/api/sensor-data')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
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
                    errorElement.textContent = `Error: ${err.message}`;
                    errorElement.style.display = 'block';
                    setTimeout(() => {
                        errorElement.style.display = 'none';
                    }, 5000);
                }
            });
            
    }

        function updateDashboard(data) {
        
        console.log('Updating dashboard with data:', data);
        
        
        // Update card values
        document.getElementById('tempValue').textContent = `${data.temperature}°C`;
        document.getElementById('humidityValue').textContent = `${data.humidity}%`;
        document.getElementById('lightValue').textContent = `${data.light} lx`;
        document.getElementById('phValue').textContent = data.ph.toFixed(1);
        
        // Update color comparison
        if (data.color_rgb) {
            updateColorComparison(data.color_rgb);
        }
        
        // Update line chart
       
            if (lineChart.data.labels.length >= 15) {
                lineChart.data.labels.shift();
                lineChart.data.datasets[0].data.shift();
                lineChart.data.datasets[1].data.shift();
            }

            lineChart.data.labels.push(`Data ${dataCounter++}`);
            lineChart.data.datasets[0].data.push(data.env_temp);
            lineChart.data.datasets[1].data.push(data.temperature);
            lineChart.update();
        
    }
    
    // Helper function to convert RGB to light intensity
    function rgbToLight(rgb) {
        if (!rgb || rgb.length !== 3) return 0;
        return Math.round((rgb[0] + rgb[1] + rgb[2]) / 3);
    }

    // Initialize and start data updates
    try {
        initCharts();
        fetchData(); // Initial load
        setInterval(fetchData, 5000); // Periodic updates
    } catch (error) {
        console.error('Initialization error:', error);
        const errorElement = document.getElementById('errorMessage');
        if (errorElement) {
            errorElement.textContent = `Initialization error: ${error.message}`;
            errorElement.style.display = 'block';
        }
    }

});