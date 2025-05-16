import os
import shutil
import sys
import stat  # Added import
import errno # Added import

# Define the error handler for shutil.rmtree
def on_rm_error(func, path, exc_info):
    """
    Error handler for shutil.rmtree.
    If the error is a permission error (EACCES), it attempts to change
    the permissions and then retries the operation.
    `func` is the function that raised the exception (e.g., os.remove, os.rmdir).
    `path` is the path to the file or directory.
    `exc_info` is a tuple similar to that returned by sys.exc_info().
    """
    # exc_info[0] is the exception type, exc_info[1] is the exception instance.
    exception_instance = exc_info[1]
    
    # Check if the error is a PermissionError and specifically EACCES (Access Denied)
    if isinstance(exception_instance, PermissionError) and \
       hasattr(exception_instance, 'errno') and exception_instance.errno == errno.EACCES:
        
        print(f"Permission error calling {func.__name__} on {path}. Attempting to fix permissions.")
        try:
            # Make the path writable by the owner.
            # For directories, owner also needs execute permission to list/delete contents.
            if os.path.isdir(path):
                # Grant owner read, write, and execute permissions
                os.chmod(path, stat.S_IRWXU)  # S_IRUSR | S_IWUSR | S_IXUSR
            elif os.path.isfile(path) or os.path.islink(path): # For files or symlinks
                # Grant owner read and write permissions
                os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
            else:
                # This case should ideally not be hit if path exists and rmtree is working on it
                print(f"Path {path} is of an unknown type. Skipping chmod.")

            # Retry the operation that failed (e.g., os.remove or os.rmdir)
            func(path)
            print(f"Successfully executed {func.__name__} on {path} after chmod.")

        except Exception as e:
            print(f"Failed to change permissions or retry {func.__name__} on {path}: {e}")
            # If fixing fails, re-raise the original error to stop shutil.rmtree.
            # Re-raising with original traceback if available from exc_info
            if len(exc_info) == 3 and exc_info[2] is not None: # exc_info is (type, value, traceback)
                 raise exc_info[1].with_traceback(exc_info[2])
            else: # Just raise the exception instance if traceback is not available
                 raise exc_info[1]
    else:
        # If it's not the specific permission error we're handling, reraise.
        # This ensures other types of errors still stop the rmtree operation.
        print(f"Unhandled error during rmtree: {exception_instance} on path {path}. Function: {func.__name__}")
        if len(exc_info) == 3 and exc_info[2] is not None:
             raise exc_info[1].with_traceback(exc_info[2])
        else:
             raise exc_info[1]

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

    # --- Destination Handling: Delete if exists ---
    if os.path.exists(dest_dir):
        if os.path.isfile(dest_dir):
            print(f"Error: Destination path '{dest_dir}' exists and is a file. Cannot overwrite a file with a directory.")
            sys.exit(1)
        
        try:
            print(f"Deleting existing directory: {dest_dir}...")
            # MODIFIED LINE: Added onerror handler
            shutil.rmtree(dest_dir, onerror=on_rm_error)
            print(f"Successfully deleted: {dest_dir}")
        except Exception as e:
            print(f"Error deleting directory {dest_dir}: {e}")
            sys.exit(1)
    
    print(f"\nStarting copy from '{source_dir}'")
    print(f"Target destination: '{dest_dir}'")
    copied_files_count = 0
    skipped_files_count = 0
    
    skipped_dirs_basenames = {'venv', '.venv', 'instance', 'migrations', '__pycache__'}
    skipped_dirs_absolute = {os.path.join(source_dir, dname) for dname in skipped_dirs_basenames}
    if dest_dir.startswith(source_dir + os.sep):
        skipped_dirs_absolute.add(dest_dir)

    for root, dirs, files in os.walk(source_dir, topdown=True):
        dirs[:] = [d for d in dirs if d not in skipped_dirs_basenames and \
                                         os.path.abspath(os.path.join(root, d)) not in skipped_dirs_absolute]

        relative_path = os.path.relpath(root, source_dir)
        dest_root = os.path.join(dest_dir, relative_path)

        try:
            if not os.path.exists(dest_root):
                os.makedirs(dest_root)
        except OSError as e:
            print(f"Error creating directory {dest_root}: {e}. Skipping this directory.")
            continue

        for filename in files:
            _, file_ext = os.path.splitext(filename)
            file_ext_lower = file_ext.lower()

            if file_ext_lower in extensions:
                source_file_path = os.path.join(root, filename)
                dest_file_path = os.path.join(dest_root, filename)
                try:
                    shutil.copy2(source_file_path, dest_file_path)
                    display_path = os.path.join(relative_path, filename) if relative_path != '.' else filename
                    print(f"  Copied: {display_path}")
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
    print("Project Code File Copier")
    print("----------------------------------------")

    relevant_extensions = {'.py', '.html', '.js', '.css', '.txt', '.json', '.xml'}

    source_path = os.getcwd() 
    print(f"Source Directory: {source_path}")

    current_dir_name = os.path.basename(source_path)
    dest_folder_name = f"{current_dir_name}_Code_Copy"
    dest_path = os.path.join(source_path, dest_folder_name)
    print(f"Proposed Destination: {dest_path}")
    print("-" * 35)

    try:
        copy_project_files(source_path, dest_path, relevant_extensions)
    except SystemExit:
        print("Operation aborted.")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
        sys.exit(1)