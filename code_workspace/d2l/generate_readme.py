from pathlib import Path
from collections import defaultdict

# The base Colab URL for your specific folder
BASE_URL = "https://colab.research.google.com/github/harshad-inarkar/ML_AI_Quiz/blob/main/code_workspace/d2l/"

current_dir = Path(".")

# Dictionary to group files by their parent directory
files_by_dir = defaultdict(list)

# Find all notebooks and group them
for ipynb_file in sorted(current_dir.rglob("*.ipynb")):
    if ".ipynb_checkpoints" in str(ipynb_file):
        continue
        
    # Get the folder path (e.g., "ch_02_linear_networks")
    parent_dir = ipynb_file.parent.as_posix()
    files_by_dir[parent_dir].append(ipynb_file)

# Write out the nicely formatted README
with open("README.md", "w", encoding="utf-8") as f:
    f.write("# 📚 PyTorch Notebooks\n\n")
    f.write("Click on any notebook below to open it directly in Google Colab:\n\n")
    
    # 1. Print files in the main root directory first (if any exist)
    if "." in files_by_dir:
        f.write("### 📂 Root Directory\n")
        for file_path in files_by_dir["."]:
            colab_link = f"{BASE_URL}{file_path.as_posix()}"
            f.write(f"* [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)]({colab_link}) **{file_path.name}**\n")
        f.write("\n")
        
    # 2. Print files grouped by their nested sub-directories
    for folder, files in sorted(files_by_dir.items()):
        if folder == ".":
            continue  # Already handled above
            
        f.write(f"### 📂 `{folder}`\n")
        for file_path in files:
            colab_link = f"{BASE_URL}{file_path.as_posix()}"
            # Only print the file name now, since the folder is in the heading
            f.write(f"* [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)]({colab_link}) **{file_path.name}**\n")
        f.write("\n")

print("README.md successfully generated with nested structures!")