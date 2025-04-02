# generate_filelist.py
import os
import sys

def generate_filtered_file_list(startpath, outfile, extensions, ignore_dirs, ignore_files):
    """
    Generates a list of files matching specific extensions, grouped by directory,
    ignoring specified directories and files. Writes the list to an output file.

    Args:
        startpath (str): The root directory to start scanning.
        outfile (str): The name of the file to write the output to.
        extensions (tuple): A tuple of file extensions to include (e.g., ('.py', '.js')).
        ignore_dirs (set): A set of directory names to ignore completely.
        ignore_files (set): A set of specific file names to ignore.
    """
    found_files_by_dir = {} # Dictionary to hold lists of files, keyed by directory path

    # Walk through the directory tree
    for root, dirs, files in os.walk(startpath, topdown=True):
        # Prevent recursion into ignored directories
        # Modify dirs[:] in-place
        dirs[:] = [d for d in dirs if d not in ignore_dirs]

        # Process files in the current directory
        relevant_files_in_current_dir = []
        for filename in files:
            # Check if file matches allowed extensions and is not ignored
            if filename.endswith(tuple(extensions)) and filename not in ignore_files:
                relevant_files_in_current_dir.append(filename)

        # If relevant files were found, store them
        if relevant_files_in_current_dir:
            # Get path relative to the starting directory
            relative_dir_path = os.path.relpath(root, startpath)
            # Normalize path separators for consistent output
            normalized_dir_path = relative_dir_path.replace('\\', '/')
            # Store sorted list of files for this directory
            found_files_by_dir[normalized_dir_path] = sorted(relevant_files_in_current_dir)

    # --- Write the output file ---
    try:
        with open(outfile, 'w', encoding='utf-8') as f:
            f.write(f"Filtered File List ({', '.join(extensions)}) under: {os.path.abspath(startpath)}\n")
            f.write("=" * 70 + "\n\n")

            if not found_files_by_dir:
                f.write("No matching files found.\n")
                return # Exit if nothing found

            # Sort directories for consistent output order
            sorted_dirs = sorted(found_files_by_dir.keys())

            # Write files grouped by directory
            for dir_path in sorted_dirs:
                # Display directory path (use './' for root)
                display_dir = f"./{dir_path}/" if dir_path != '.' else "./"
                f.write(f"{display_dir}\n")
                # List files within that directory
                for filename in found_files_by_dir[dir_path]:
                    f.write(f"  - {filename}\n")
                f.write("\n") # Add a blank line between directories

    except IOError as e:
        print(f"Error writing to output file {outfile}: {e}", file=sys.stderr)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)


# --- Configuration ---
# Directory to start scanning from (current directory where script is run)
ROOT_DIR = '.'
# Name of the output file
OUTPUT_FILE = 'filetree_filtered.txt'
# Tuple of file extensions to include (must start with '.')
ALLOWED_EXTENSIONS = ('.py', '.html', '.js')
# Set of directory names to completely ignore (and not recurse into)
IGNORE_DIRS = {
    'venv', '.git', '.vscode', '__pycache__',
    'instance', 'migrations', 'node_modules', 'dist', 'build'
    }
# Set of specific file names to ignore everywhere
IGNORE_FILES = {
    '.gitignore', '.env', 'local.db', 'filetree.txt',
    OUTPUT_FILE, # Ignore the output file itself
    '.DS_Store'
    }

# --- Script Execution ---
if __name__ == "__main__":
    start_directory = os.path.abspath(ROOT_DIR)
    print(f"Generating list of filtered files ({', '.join(ALLOWED_EXTENSIONS)})")
    print(f"Starting from: {start_directory}")
    print(f"Ignoring Dirs: {IGNORE_DIRS}")
    print(f"Ignoring Files: {IGNORE_FILES}")
    print(f"Outputting to: {OUTPUT_FILE}...")

    generate_filtered_file_list(
        start_directory,
        OUTPUT_FILE,
        ALLOWED_EXTENSIONS,
        IGNORE_DIRS,
        IGNORE_FILES
    )

    print(f"Done. Filtered file list saved to '{OUTPUT_FILE}'.")