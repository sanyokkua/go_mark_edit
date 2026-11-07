# Ubuntu 24.04 verification container

This harness checks the current named branch and its working changes in a temporary, self-contained Git clone under the repository's ignored `.local_tmp_files/` directory. Colima can mount this path, and the runner removes it afterward. It never mounts the active working tree. It applies the tracked diff from `HEAD` and copies untracked, non-ignored files; ignored caches and build outputs are excluded. The Docker image uses Ubuntu 24.04, Go from `go.mod`, Node from `.nvmrc`, Playwright from `frontend/package-lock.json`, GTK3/WebKitGTK 4.1, Xvfb, native clipboard tools and browser system libraries. `scripts/build setup --with-browser` installs the Wails version pinned by `go.mod` and Chromium.

From the repository root, with a running Docker daemon:

```bash
tools/verification-container/run.sh --arch arm64 --version 1.0.0-beta.1
tools/verification-container/run.sh --arch amd64 --version 1.0.0-beta.1
```

The runner executes `scripts/baseline`, all six `scripts/verify` stages under Xvfb with `E2E_NATIVE_CLIPBOARD=1`, `scripts/baseline --compare`, and a separate release-mode build. It prints `uname -m` and the executable type. Each invocation uses its own clone and home directory. Generated files and Go/npm/Playwright caches remain inside that disposable environment; the image contains only the OS and browser prerequisites. Run it when the active checkout is quiescent: edits made while the snapshot is being copied may not be included consistently. The isolated clone retains the branch name for baseline records, but its Git index does not preserve which changes were staged in the active checkout.

ARM64 runs natively only when the Docker host and daemon support that platform. AMD64 on Apple Silicon requires configured emulation and may be slow or unavailable. Allow at least several gigabytes of memory and disk and enough time for two complete E2E passes. Container E2E is headless evidence; it does not establish native desktop rendering or compatibility with every Linux distribution. The binary requires GTK3 and WebKitGTK 4.1 runtime libraries on the destination system.
