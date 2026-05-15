// gen-icon.swift
//
// Render Galley's AppIcon.iconset from the SF Symbol book.closed.fill so
// Finder / Launchpad / Spotlight have a coherent icon for the menubar
// app's `.app` bundle. The look matches the Auteur's Atelier home
// page (vermilion accent on cream paper).
//
// Usage:
//   swift gen-icon.swift <output-iconset-dir>
//
// Output: ten PNGs in the iconset Apple expects, named per
// https://developer.apple.com/library/archive/documentation/GraphicsAnimation/Conceptual/HighResolutionOSX/Optimizing/Optimizing.html
//
// Caller follows with `iconutil -c icns <iconset> -o AppIcon.icns`.

import AppKit

guard CommandLine.arguments.count >= 2 else {
    FileHandle.standardError.write(Data("usage: swift gen-icon.swift <output-iconset-dir>\n".utf8))
    exit(2)
}
let outDir = CommandLine.arguments[1]
try? FileManager.default.createDirectory(
    atPath: outDir, withIntermediateDirectories: true)

// Apple-required iconset entries.
let entries: [(size: Int, file: String)] = [
    (16,   "icon_16x16.png"),
    (32,   "icon_16x16@2x.png"),
    (32,   "icon_32x32.png"),
    (64,   "icon_32x32@2x.png"),
    (128,  "icon_128x128.png"),
    (256,  "icon_128x128@2x.png"),
    (256,  "icon_256x256.png"),
    (512,  "icon_256x256@2x.png"),
    (512,  "icon_512x512.png"),
    (1024, "icon_512x512@2x.png"),
]

// Auteur's Atelier palette — cream paper + vermilion accent.
let paper     = NSColor(red: 0.98, green: 0.96, blue: 0.94, alpha: 1)
let vermilion = NSColor(red: 0.83, green: 0.30, blue: 0.20, alpha: 1)

guard let symbol = NSImage(
    systemSymbolName: "book.closed.fill",
    accessibilityDescription: "Galley"
) else {
    FileHandle.standardError.write(Data(
        "error: SF Symbol 'book.closed.fill' unavailable (requires macOS 11+)\n".utf8))
    exit(1)
}

// Tint the symbol with vermilion using a palette configuration so the
// book ships as a solid color rather than the template black we use in
// the status bar.
let paletteConfig = NSImage.SymbolConfiguration(paletteColors: [vermilion])
let tinted = symbol.withSymbolConfiguration(paletteConfig) ?? symbol

for (size, file) in entries {
    let canvas = NSImage(size: NSSize(width: size, height: size))
    canvas.lockFocus()

    // Rounded-rect paper background. ~22.5% corner radius matches
    // macOS Big Sur+ app-icon convention.
    let radius = CGFloat(size) * 0.225
    let bgRect = NSRect(x: 0, y: 0, width: size, height: size)
    paper.setFill()
    NSBezierPath(roundedRect: bgRect, xRadius: radius, yRadius: radius).fill()

    // Center the book glyph at ~65% of canvas size — leaves a comfortable
    // letter-pressed margin around the symbol.
    let glyphSize = CGFloat(size) * 0.65
    let glyphRect = NSRect(
        x: (CGFloat(size) - glyphSize) / 2,
        y: (CGFloat(size) - glyphSize) / 2,
        width: glyphSize,
        height: glyphSize
    )
    tinted.draw(
        in: glyphRect, from: .zero,
        operation: .sourceOver, fraction: 1.0,
        respectFlipped: true, hints: nil
    )

    canvas.unlockFocus()

    guard let tiff = canvas.tiffRepresentation,
          let bmp  = NSBitmapImageRep(data: tiff),
          let png  = bmp.representation(using: .png, properties: [:])
    else {
        FileHandle.standardError.write(Data("error: failed to render \(file)\n".utf8))
        exit(1)
    }
    let outURL = URL(fileURLWithPath: "\(outDir)/\(file)")
    try? png.write(to: outURL)
}

print("wrote \(entries.count) PNGs to \(outDir)")
