import CoreGraphics
import Foundation

guard CommandLine.arguments.count == 2, let pid = Int(CommandLine.arguments[1]) else {
    fputs("expected process ID\n", stderr)
    exit(2)
}
guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
    fputs("no GUI session or WindowServer available\n", stderr)
    exit(2)
}
let found = windows.contains { window in
    guard let owner = window[kCGWindowOwnerPID as String] as? Int,
          let layer = window[kCGWindowLayer as String] as? Int,
          let alpha = window[kCGWindowAlpha as String] as? Double,
          let bounds = window[kCGWindowBounds as String] as? [String: CGFloat],
          let width = bounds["Width"], let height = bounds["Height"] else { return false }
    return owner == pid && layer == 0 && alpha > 0 && width > 0 && height > 0
}
print(found ? "visible" : "waiting")
