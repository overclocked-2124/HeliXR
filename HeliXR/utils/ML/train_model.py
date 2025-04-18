import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
import joblib

# Load data
data = pd.read_csv("dummy_valve_data.csv")

# Define input features and target
features = ['pH', 'Temperature', 'Red', 'Green', 'Blue', 'Liquid_Level',
            'Max_Level', 'is_neutral_ph', 'is_optimal_temp',
            'color_intensity', 'level_ratio']
X = data[features]
y = data['Valve_Status']  # Target variable: 0 (close), 1 (open)

# Split into training and testing (80-20)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train the model
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Evaluate
accuracy = model.score(X_test, y_test)
print(f"Model Accuracy: {accuracy * 100:.2f}%")

# Save the model
joblib.dump(model, "valve_model.pkl")
print("Model saved as valve_model.pkl")
