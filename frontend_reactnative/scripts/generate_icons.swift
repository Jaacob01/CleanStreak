import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// 从 assets/logo.png(完整圆角图标)与 assets/logo-icon.png(无底透明图形)
// 生成全套应用图标。iOS 图标禁止透明通道,完整图标会平铺到奶油色底上。
// 用法: swift scripts/generate_icons.swift <assets目录>

let outDir = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "assets"

let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
// 与 logo.png 圆角底一致的奶油色
let ivory = CGColor(srgbRed: 0xF5 / 255.0, green: 0xF1 / 255.0, blue: 0xE6 / 255.0, alpha: 1)

func loadCGImage(_ name: String) -> CGImage {
    let url = URL(fileURLWithPath: "\(outDir)/\(name)") as CFURL
    let src = CGImageSourceCreateWithURL(url, nil)!
    return CGImageSourceCreateImageAtIndex(src, 0, nil)!
}

func makeContext(_ size: Int) -> CGContext {
    CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
              space: sRGB, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
}

func savePNG(_ ctx: CGContext, _ path: String) {
    let img = ctx.makeImage()!
    let url = URL(fileURLWithPath: path) as CFURL
    let dest = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, img, nil)
    CGImageDestinationFinalize(dest)
}

let logo = loadCGImage("logo.png")
let logoIcon = loadCGImage("logo-icon.png")

// 完整图标平铺到不透明底
func drawFlattened(_ ctx: CGContext, image: CGImage, size: CGFloat) {
    ctx.setFillColor(ivory)
    ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
}

// iOS 主图标
let icon = makeContext(1024)
drawFlattened(icon, image: logo, size: 1024)
savePNG(icon, "\(outDir)/icon.png")

// web favicon
let fav = makeContext(48)
drawFlattened(fav, image: logo, size: 48)
savePNG(fav, "\(outDir)/favicon.png")

// Android 自适应背景层:纯奶油色
let aBg = makeContext(1024)
aBg.setFillColor(ivory)
aBg.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
savePNG(aBg, "\(outDir)/android-icon-background.png")

// Android 自适应前景层:图形缩放进中央 66% 安全区
let fgBox: CGFloat = 540
let fgInset = (1024 - fgBox) / 2
let aFg = makeContext(1024)
aFg.draw(logoIcon, in: CGRect(x: fgInset, y: fgInset, width: fgBox, height: fgBox))
savePNG(aFg, "\(outDir)/android-icon-foreground.png")

// Android 单色层:按 alpha 提取白色剪影,尺寸与前景对齐
let aMono = makeContext(1024)
aMono.draw(logoIcon, in: CGRect(x: fgInset, y: fgInset, width: fgBox, height: fgBox))
aMono.setBlendMode(.sourceIn)
aMono.setFillColor(CGColor(gray: 1, alpha: 1))
aMono.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
savePNG(aMono, "\(outDir)/android-icon-monochrome.png")

// 调试预览:模拟 Android 圆形蒙版下的自适应图标效果
let fgCtx = makeContext(1024)
fgCtx.setFillColor(ivory)
fgCtx.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
fgCtx.draw(logoIcon, in: CGRect(x: fgInset, y: fgInset, width: fgBox, height: fgBox))
let composed = fgCtx.makeImage()!

let prev = makeContext(512)
prev.interpolationQuality = .high
prev.addEllipse(in: CGRect(x: 0, y: 0, width: 512, height: 512))
prev.clip()
prev.draw(composed, in: CGRect(x: 0, y: 0, width: 512, height: 512))
savePNG(prev, "\(outDir)/_preview_adaptive.png")

print("icons written to \(outDir)")
