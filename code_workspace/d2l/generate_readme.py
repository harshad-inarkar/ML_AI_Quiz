from pathlib import Path
from collections import defaultdict

# Updated base Colab URL for the new d2l folder location
BASE_URL = "https://colab.research.google.com/github/harshad-inarkar/ML_AI_Quiz/blob/main/code_workspace/d2l/"

# Start looking in the current directory
current_dir = Path(".")

# Dictionary to group files by their parent directory
files_by_dir = defaultdict(list)

# Find all notebooks and group them
for ipynb_file in sorted(current_dir.rglob("*.ipynb")):
    # Skip hidden Jupyter checkpoint folders
    if ".ipynb_checkpoints" in str(ipynb_file):
        continue
        
    # Get the folder path (e.g., "pytorch/ch_02_preliminaries")
    parent_dir = ipynb_file.parent.as_posix()
    files_by_dir[parent_dir].append(ipynb_file)

# 1. Build the text content
content = "# 📚 D2L Notebooks\n\n"
content += "Click on any filename below to open it directly in Google Colab:\n\n"

# Print files in the main root directory first (if any exist)
if "." in files_by_dir:
    content += "### 📂 Root Directory\n"
    for file_path in files_by_dir["."]:
        colab_link = f"{BASE_URL}{file_path.as_posix()}"
        # Clean text hyperlink
        content += f"* [{file_path.name}]({colab_link})\n"
    content += "\n"
    
# Print files grouped by their nested sub-directories
for folder, files in sorted(files_by_dir.items()):
    if folder == ".":
        continue  
        
    content += f"### 📂 `{folder}`\n"
    for file_path in files:
        colab_link = f"{BASE_URL}{file_path.as_posix()}"
        # Clean text hyperlink
        content += f"* [{file_path.name}]({colab_link})\n"
    content += "\n"

# 2. Write the content to BOTH files
with open("README.md", "w", encoding="utf-8") as f:
    f.write(content)

with open("index.md", "w", encoding="utf-8") as f:
    f.write(content)

print("✅ README.md and index.md successfully generated with clean text links!")