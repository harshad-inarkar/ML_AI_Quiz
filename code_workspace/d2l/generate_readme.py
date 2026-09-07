from pathlib import Path

# The base Colab URL for your specific folder
BASE_URL = "https://colab.research.google.com/github/harshad-inarkar/ML_AI_Quiz/blob/main/code_workspace/d2l/"

# Start looking in the current directory (where the script is located)
current_dir = Path(".")

# Open (or create) the README.md file to write to it
with open("README.md", "w", encoding="utf-8") as f:
    f.write("# PyTorch Notebooks\n\n")
    f.write("Click on any notebook below to open it directly in Google Colab:\n\n")
    
    # Recursively find all .ipynb files
    for ipynb_file in sorted(current_dir.rglob("*.ipynb")):
        # Skip hidden Jupyter checkpoint folders
        if ".ipynb_checkpoints" in str(ipynb_file):
            continue
            
        # Convert path to a string with forward slashes (safe for web URLs)
        relative_path = ipynb_file.as_posix()
        
        # Create the markdown link
        colab_link = f"{BASE_URL}{relative_path}"
        
        # Write the bullet point to the README
        f.write(f"* [{relative_path}]({colab_link})\n")

print("README.md successfully generated!")