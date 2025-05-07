import os
import shutil
import sys
import datetime # Added for unique folder name

def copy_project_files(source_dir, dest_dir, extensions):
    """
    Copies files with specified extensions from source_dir to dest_dir,
    preserving the directory structure.

    Args:
        source_dir (str): The path to the source project directory.
        dest_dir (str): The path to the destination directory (will be created if needed).
        extensions (set): A set of lowercase file extensions to copy (e.g., {'.py', '.html'}).
    """
    # Normalize paths
    source_dir = os.path.abspath(source_dir)
    dest_dir = os.path.abspath(dest_dir)

    # Basic validation
    if not os.path.isdir(source_dir):
        print(f"Error: Source directory not found or is not a directory: {source_dir}")
        sys.exit(1)

    if source_dir == dest_dir: # Should not happen with new logic, but safe check
        print("Error: Source and destination directories cannot be the same.")
        sys.exit(1)

    # --- Modified Destination Handling ---
    # If dest exists, append timestamp to avoid overwriting previous copies easily
    # Alternatively, could delete existing or always overwrite - appending timestamp is safer.
    base_dest_dir = dest_dir
    counter = 1
    while os.path.exists(dest_dir):
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        dest_dir = f"{base_dest_dir}_{timestamp}_{counter}"
        counter += 1
        # Safety break
        if counter > 10:
            print(f"Error: Tried too many destination names like '{base_dest_dir}_...'. Please check the directory.")
            sys.exit(1)

    print(f"Starting copy from '{source_dir}'")
    print(f"Creating destination: '{dest_dir}'...")
    copied_files_count = 0
    skipped_files_count = 0
    skipped_dirs = [os.path.join(source_dir, 'venv'),
                    os.path.join(source_dir, '.venv'),
                    os.path.join(source_dir, 'instance'), # Often contains secrets/DB
                    os.path.join(source_dir, 'migrations')] # Usually not needed for code copy

    # Walk through the source directory
    for root, dirs, files in os.walk(source_dir):
        # --- Skip common/unwanted directories ---
        # Use list comprehension for skipping based on full path check
        dirs[:] = [d for d in dirs if os.path.abspath(os.path.join(root, d)) not in skipped_dirs and d != '__pycache__']

        # Check if current root itself should be skipped
        if any(os.path.abspath(root) == skip_dir for skip_dir in skipped_dirs):
             print(f"Skipping directory: {os.path.relpath(root, source_dir)}")
             continue

        # Calculate the corresponding destination directory path
        relative_path = os.path.relpath(root, source_dir)
        dest_root = os.path.join(dest_dir, relative_path)

        # Create destination directory
        os.makedirs(dest_root, exist_ok=True)

        # Process files
        for filename in files:
            _, file_ext = os.path.splitext(filename)
            file_ext_lower = file_ext.lower()

            if file_ext_lower in extensions:
                source_file_path = os.path.join(root, filename)
                dest_file_path = os.path.join(dest_root, filename)
                try:
                    shutil.copy2(source_file_path, dest_file_path)
                    # Print relative path for cleaner output
                    print(f"  Copied: {os.path.join(relative_path, filename)}")
                    copied_files_count += 1
                except Exception as e:
                    print(f"  Error copying {source_file_path}: {e}")
                    skipped_files_count += 1
            else:
                skipped_files_count += 1

    print("\n----------------------------------------")
    print("Copy operation complete.")
    print(f"  Files copied: {copied_files_count}")
    print(f"  Files skipped/errored: {skipped_files_count}")
    print(f"  Output Location: {dest_dir}")
    print("----------------------------------------")


if __name__ == "__main__":
    print("Project Code File Copier (.py, .html, .js)")
    print("----------------------------------------")

    # Define the extensions to copy
    relevant_extensions = {'.py', '.html', '.js', '.css', '.txt', '.json', '.xml'}

    # --- Use current directory as source ---
    source_path = os.getcwd() # Get current working directory explicitly
    print(f"Source Directory: {source_path}")

    # --- Automatically create destination folder name ---
    # Use current directory name + "_Code_Copy" suffix
    current_dir_name = os.path.basename(source_path)
    dest_folder_name = f"{current_dir_name}_Code_Copy"
    # Destination path is inside the current directory
    dest_path = os.path.join(source_path, dest_folder_name)
    print(f"Default Destination: {dest_path}")
    # Note: The copy function will append timestamp if default destination exists
    print("-" * 35)

    try:
        # Use the determined source and base destination paths
        copy_project_files(source_path, dest_path, relevant_extensions)
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
        sys.exit(1)