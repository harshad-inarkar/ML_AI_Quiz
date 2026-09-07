from pathlib import Path
from collections import defaultdict

# Updated base Colab URL for the new d2l folder location
BASE_URL = "https://colab.research.google.com/github/harshad-inarkar/ML_AI_Quiz/blob/main/code_workspace/d2l/"

current_dir = Path(".")
files_by_dir = defaultdict(list)

# Find all notebooks and group them
for ipynb_file in sorted(current_dir.rglob("*.ipynb")):
    if ".ipynb_checkpoints" in str(ipynb_file):
        continue
    parent_dir = ipynb_file.parent.as_posix()
    files_by_dir[parent_dir].append(ipynb_file)

# 1. Initialize Markdown (for GitHub Repo)
md_content = "# 📚 D2L Notebooks\n\n"
md_content += "Click on any filename below to open it directly in Google Colab:\n\n"

# 2. Initialize HTML (for GitHub Pages URL) with clean, Github-like styling
html_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>D2L Notebooks</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #24292f; line-height: 1.6; }
        a { color: #0969da; text-decoration: none; }
        a:hover { text-decoration: underline; }
        h1, h3 { border-bottom: 1px solid #hsla(210,18%,87%,1); padding-bottom: 0.3em; }
        ul { list-style-type: none; padding-left: 0; }
        li { padding: 0.25em 0; }
        code { background-color: #f6f8fa; padding: 0.2em 0.4em; border-radius: 6px; font-size: 85%; }
    </style>
</head>
<body>
    <h1>📚 D2L Notebooks</h1>
    <p>Click on any filename below to open it directly in Google Colab:</p>
"""

def add_section(folder_name, files_list, md, html):
    md += f"### 📂 `{folder_name}`\n"
    html += f"<h3>📂 <code>{folder_name}</code></h3>\n<ul>\n"
    
    for file_path in files_list:
        colab_link = f"{BASE_URL}{file_path.as_posix()}"
        
        # Add to Markdown
        md += f"* [{file_path.name}]({colab_link})\n"
        
        # Add to HTML
        html += f"<li><a href='{colab_link}' target='_blank'>{file_path.name}</a></li>\n"
        
    md += "\n"
    html += "</ul>\n\n"
    return md, html

# Process Root directory
if "." in files_by_dir:
    md_content, html_content = add_section("Root Directory", files_by_dir["."], md_content, html_content)

# Process Sub-directories
for folder, files in sorted(files_by_dir.items()):
    if folder != ".":
        md_content, html_content = add_section(folder, files, md_content, html_content)

# Close HTML tags
html_content += "</body>\n</html>"

# 3. Write BOTH files
with open("README.md", "w", encoding="utf-8") as f:
    f.write(md_content)

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html_content)

print("✅ README.md and index.html successfully generated!")