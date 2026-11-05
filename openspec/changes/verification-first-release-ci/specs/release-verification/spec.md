# Release verification

## Purpose

Defines the verification and publication guarantees for distributed GoMarkEdit builds.

## ADDED Requirements

### Requirement: Shared revision verification

Pull requests, master pushes and manual verification SHALL run the same required Linux, macOS and Windows checks and expose an aggregate result that fails on failure, cancellation or unexpected skips.

#### Scenario: Pull request verification

- **WHEN** a pull request is opened or updated
- **THEN** the required checks run without path exclusions and their aggregate reports success only when all required checks succeed

### Requirement: Exact revision release gate

Release builds SHALL start only after successful required verification of the exact source commit. Tag releases SHALL require that commit to be an ancestor of master and a strict stable, alpha or beta version.

#### Scenario: Newer failed attempt

- **WHEN** a newer qualifying verification attempt fails after an earlier attempt succeeded for the same commit
- **THEN** release builds do not start

#### Scenario: No completed verification

- **WHEN** no qualifying completed verification exists or the latest qualifying run is still in progress
- **THEN** the same required checks run for the exact release commit before builds start

### Requirement: Executable-only release assets

Release production SHALL generate five native assets: macOS ARM64 app ZIP, Windows AMD64 and ARM64 executables, and Linux AMD64 and ARM64 executables. Release build jobs SHALL NOT run tests or generate installers.

#### Scenario: One build fails

- **WHEN** any of the five release builds fails or is skipped
- **THEN** no release is published

### Requirement: Windows webview prerequisite

The Windows release SHALL show an error when the WebView2 runtime is missing and SHALL NOT download it. The user must install the runtime separately.

#### Scenario: Runtime is missing

- **WHEN** the Windows release starts on a machine without WebView2
- **THEN** it shows an error and does not download the runtime

### Requirement: Complete release publication

A tag release SHALL publish only after all five assets from the current run have been collected and checksummed. Manual release dispatch SHALL upload dry-run assets without publishing a release.

#### Scenario: Missing asset

- **WHEN** one expected asset is missing from the current run
- **THEN** publication fails and no partial release is created

#### Scenario: Manual dispatch

- **WHEN** a manual release run succeeds for version 1.2.3-beta.1
- **THEN** the five assets and SHA256SUMS.txt are uploaded as dry-run artifacts and no GitHub Release is created
