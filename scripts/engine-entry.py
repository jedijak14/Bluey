"""Frozen Windows engine entry point; no shell, downloads or elevated execution."""
import multiprocessing
if __name__ == '__main__':
    multiprocessing.freeze_support()
    from backend.server import main
    main()
