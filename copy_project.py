import os
import shutil
import sys

def copy_project_files(source_dir, dest_dir_param, extensions):
    """
    Copies files with specified extensions from source_dir to dest_dir_param,
    preserving the directory structure. If dest_dir_param exists, it will be
    deleted after user confirmation before copying.

    Args:
        source_dir (str): The path to the source project directory.
        dest_dir_param (str): The path to the destination directory.
        extensions (set): A set of lowercase file extensions to copy (e.g., {'.py', '.html'}).
    """
    # Normalize paths
    source_dir = os.path.abspath(source_dir)
    dest_dir = os.path.abspath(dest_dir_param) # Use dest_dir internally as the final target

    # Basic validation
    if not os.path.isdir(source_dir):
        print(f"Error: Source directory not found or is not a directory: {source_dir}")
        sys.exit(1)

    if source_dir == dest_dir:
        print("Error: Source and destination directories cannot be the same.")
        sys.exit(1)

    # --- New Destination Handling: Delete if exists ---
    if os.path.exists(dest_dir):
        if os.path.isfile(dest_dir):
            print(f"Error: Destination path '{dest_dir}' exists and is a file. Cannot overwrite a file with a directory.")
            sys.exit(1)
        
  
            
        
        try:
            print(f"Deleting existing directory: {dest_dir}...")
            shutil.rmtree(dest_dir)
            print(f"Successfully deleted: {dest_dir}")
        except Exception as e:
            print(f"Error deleting directory {dest_dir}: {e}")
            sys.exit(1)
    

    # At this point, dest_dir either never existed or has been successfully deleted.
    # The main dest_dir will be created by os.makedirs inside the loop when relative_path is '.'.

    print(f"\nStarting copy from '{source_dir}'")
    print(f"Target destination: '{dest_dir}'")
    copied_files_count = 0
    skipped_files_count = 0
    
    # Define directories to skip copying from the source
    # These paths are made absolute based on the source_dir
    skipped_dirs_basenames = {'venv', '.venv', 'instance', 'migrations', '__pycache__'}
    skipped_dirs_absolute = {os.path.join(source_dir, dname) for dname in skipped_dirs_basenames}
    # Add the destination directory itself to skipped_dirs_absolute if it's inside source_dir,
    # though pre-deletion should prevent os.walk from seeing it. This is a safeguard.
    if dest_dir.startswith(source_dir + os.sep):
        skipped_dirs_absolute.add(dest_dir)


    # Walk through the source directory
    for root, dirs, files in os.walk(source_dir, topdown=True):
        # Filter out directories to skip from further traversal
        # Check against basenames for general skips like '__pycache__' anywhere
        # Check against absolute paths for specific configured skips like 'venv' in source_dir
        dirs[:] = [d for d in dirs if d not in skipped_dirs_basenames and \
                                      os.path.abspath(os.path.join(root, d)) not in skipped_dirs_absolute]

        # Calculate the corresponding destination directory path
        relative_path = os.path.relpath(root, source_dir)
        dest_root = os.path.join(dest_dir, relative_path)

        # Create destination subdirectory if it doesn't exist
        # This will also create the main dest_dir on the first iteration where relative_path is '.'
        try:
            if not os.path.exists(dest_root): # Avoid calling makedirs if path already exists (e.g. dest_dir itself)
                os.makedirs(dest_root)
        except OSError as e:
            print(f"Error creating directory {dest_root}: {e}. Skipping this directory.")
            continue # Skip processing files in a directory that couldn't be created

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
                    display_path = os.path.join(relative_path, filename) if relative_path != '.' else filename
                    print(f"  Copied: {display_path}")
                    copied_files_count += 1
                except Exception as e:
                    print(f"  Error copying {source_file_path}: {e}")
                    skipped_files_count += 1
            else:
                # This will count files not matching extension in non-skipped directories
                # To avoid this, you might only want to increment skipped_files_count on error
                skipped_files_count += 1 

    print("\n----------------------------------------")
    print("Copy operation complete.")
    print(f"  Files copied: {copied_files_count}")
    print(f"  Files skipped/errored: {skipped_files_count}")
    print(f"  Output Location: {dest_dir}")
    print("----------------------------------------")


if __name__ == "__main__":
    print("Project Code File Copier")
    print("----------------------------------------")

    # Define the extensions to copy
    relevant_extensions = {'.py', '.html', '.js', '.css', '.txt', '.json', '.xml'}

    # --- Use current directory as source ---
    source_path = os.getcwd() 
    print(f"Source Directory: {source_path}")

    # --- Automatically create destination folder name ---
    # Use current directory name + "_Code_Copy" suffix
    current_dir_name = os.path.basename(source_path)
    dest_folder_name = f"{current_dir_name}_Code_Copy"
    # Destination path is inside the current directory by default
    dest_path = os.path.join(source_path, dest_folder_name)
    print(f"Proposed Destination: {dest_path}") # Message changed
    print("-" * 35)

    try:
        copy_project_files(source_path, dest_path, relevant_extensions)
    except SystemExit: # Catches sys.exit() calls from the function
        print("Operation aborted.")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
        sys.exit(1)