import os
import shutil

os.makedirs('backend/benchmark_dataset/sets', exist_ok=True)
shutil.copy('backend/benchmark_dataset/dataset.json', 'backend/benchmark_dataset/sets/regression_set.json')
print("Created regression_set.json")
