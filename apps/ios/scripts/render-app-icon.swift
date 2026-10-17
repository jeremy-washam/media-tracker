import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// Render the existing full J2 vector. No tracing or generated artwork is involved.
let iosRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let repositoryRoot = iosRoot.deletingLastPathComponent().deletingLastPathComponent()
let source = repositoryRoot.appendingPathComponent("docs/design/logo-exploration/j2-vector/imladris-j2.svg")
let output = iosRoot.appendingPathComponent("Imladris/Assets.xcassets/AppIcon.appiconset")
let svg = try String(contentsOf: source, encoding: .utf8)

func attribute(_ pattern: String) throws -> String {
    let regex = try NSRegularExpression(pattern: pattern)
    guard let match = regex.firstMatch(in: svg, range: NSRange(svg.startIndex..., in: svg)),
        let range = Range(match.range(at: 1), in: svg)
    else { fatalError("Missing SVG attribute: \(pattern)") }
    return String(svg[range])
}

let data = try attribute("<path[^>]*\\sd=\"([^\"]+)\"")
let tokenPattern = "[A-Za-z]|[-+]?(?:[0-9]*\\.)?[0-9]+(?:[eE][-+]?[0-9]+)?"
let tokenRegex = try NSRegularExpression(pattern: tokenPattern)
let tokens = tokenRegex.matches(in: data, range: NSRange(data.startIndex..., in: data)).map {
    String(data[Range($0.range, in: data)!])
}
let path = CGMutablePath()
var index = 0
func point() -> CGPoint {
    guard index + 1 < tokens.count,
        let x = Double(tokens[index]), let y = Double(tokens[index + 1])
    else { fatalError("Invalid SVG coordinates") }
    index += 2
    return CGPoint(x: x, y: y)
}
while index < tokens.count {
    let command = tokens[index]
    index += 1
    switch command {
    case "M": path.move(to: point())
    case "C":
        let first = point()
        let second = point()
        let end = point()
        path.addCurve(to: end, control1: first, control2: second)
    case "Z": path.closeSubpath()
    default: fatalError("Unsupported SVG command: \(command)")
    }
}

func color(_ hex: UInt32) -> CGColor {
    CGColor(
        srgbRed: Double((hex >> 16) & 255) / 255,
        green: Double((hex >> 8) & 255) / 255,
        blue: Double(hex & 255) / 255, alpha: 1
    )
}

try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
for (filename, background, foreground) in [
    ("AppIcon.png", UInt32(0xF3F1EA), UInt32(0x242623)),
    ("AppIcon-dark.png", UInt32(0x20221F), UInt32(0xEEEDE6)),
    ("AppIcon-tinted.png", UInt32(0x000000), UInt32(0xFFFFFF)),
] {
    // Opaque, square artwork: iOS applies its own rounded icon mask.
    let size = 1024
    let context = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    )!
    context.setFillColor(color(background))
    context.fill(CGRect(x: 0, y: 0, width: size, height: size))
    // Fit the artwork itself, leaving 48 px on its longest axis.
    let bounds = path.boundingBoxOfPath
    let scale = 928 / max(bounds.width, bounds.height)
    let width = bounds.width * scale
    let height = bounds.height * scale
    context.translateBy(x: (1024 - width) / 2, y: (1024 + height) / 2)
    context.scaleBy(x: scale, y: -scale)
    context.translateBy(x: -bounds.minX, y: -bounds.minY)
    context.addPath(path)
    context.setFillColor(color(foreground))
    context.drawPath(using: .eoFill)
    let image = context.makeImage()!
    let url = output.appendingPathComponent(filename)
    let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { fatalError("Could not save \(filename)") }
    print("Rendered \(filename)")
}
